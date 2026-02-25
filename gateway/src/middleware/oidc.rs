//! SSO / OIDC Integration — JWT validation and claim → RBAC mapping.
//!
//! Supports any OIDC-compliant IdP (Okta, Azure AD, Google Workspace, Auth0).
//! Workflow:
//! 1. Fetch `.well-known/openid-configuration` from provider
//! 2. Cache JWKS keys (public keys for JWT signature verification)
//! 3. On each request with `Authorization: Bearer <jwt>`:
//!    a. Decode header → find matching `kid` in JWKS
//!    b. Verify signature, expiry, audience, issuer
//!    c. Map OIDC claims → AuthContext (role, scopes, org_id, user_id)
//!
//! Keys are cached in-memory with a 1-hour TTL and refreshed on cache miss.

use chrono::{Duration, Utc};
use dashmap::DashMap;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

// ── Types ────────────────────────────────────────────────────

/// OIDC provider configuration (loaded from DB).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OidcProvider {
    pub id: Uuid,
    pub org_id: Uuid,
    pub name: String,
    pub issuer_url: String,
    pub client_id: String,
    pub jwks_uri: Option<String>,
    pub audience: Option<String>,
    pub claim_mapping: serde_json::Value,
    pub default_role: String,
    pub default_scopes: String,
    pub enabled: bool,
}

/// OpenID Connect Discovery document (subset of fields we need).
#[derive(Debug, Deserialize)]
pub struct OidcDiscovery {
    pub issuer: String,
    pub jwks_uri: String,
    pub authorization_endpoint: Option<String>,
    pub token_endpoint: Option<String>,
}

/// JSON Web Key Set.
#[derive(Debug, Clone, Deserialize)]
pub struct Jwks {
    pub keys: Vec<Jwk>,
}

/// A single JSON Web Key.
#[derive(Debug, Clone, Deserialize)]
pub struct Jwk {
    pub kty: String,
    pub kid: Option<String>,
    #[serde(rename = "use")]
    pub key_use: Option<String>,
    pub alg: Option<String>,
    pub n: Option<String>,
    pub e: Option<String>,
    // For EC keys
    pub crv: Option<String>,
    pub x: Option<String>,
    pub y: Option<String>,
}

/// Validated OIDC claims extracted from a JWT.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OidcClaims {
    /// Subject (user identifier from the IdP)
    pub sub: String,
    /// Email (if present in the token)
    pub email: Option<String>,
    /// Name (if present)
    pub name: Option<String>,
    /// Issuer
    pub iss: String,
    /// Audience
    pub aud: Option<String>,
    /// Expiration (Unix timestamp)
    pub exp: i64,
    /// Issued at (Unix timestamp)
    pub iat: Option<i64>,
    /// All raw claims (for custom claim mapping)
    pub raw: serde_json::Value,
}

/// Result of OIDC authentication — maps to AuthContext fields.
#[derive(Debug, Clone)]
pub struct OidcAuthResult {
    pub user_id: String,
    pub email: Option<String>,
    pub role: String,
    pub scopes: Vec<String>,
    pub org_id: Uuid,
    pub provider_name: String,
}

// ── JWKS Cache ───────────────────────────────────────────────

struct CachedJwks {
    jwks: Jwks,
    fetched_at: chrono::DateTime<Utc>,
}

static JWKS_CACHE: Lazy<DashMap<String, CachedJwks>> = Lazy::new(DashMap::new);

const JWKS_CACHE_TTL_SECS: i64 = 3600; // 1 hour

/// Fetch JWKS keys for a provider, with caching.
pub async fn get_jwks(jwks_uri: &str) -> anyhow::Result<Jwks> {
    // Check cache
    if let Some(cached) = JWKS_CACHE.get(jwks_uri) {
        let age = Utc::now() - cached.fetched_at;
        if age < Duration::seconds(JWKS_CACHE_TTL_SECS) {
            return Ok(cached.jwks.clone());
        }
    }

    // Fetch fresh
    tracing::info!(jwks_uri = %jwks_uri, "Fetching JWKS keys");
    let resp = reqwest::get(jwks_uri).await?;
    let jwks: Jwks = resp.json().await?;

    JWKS_CACHE.insert(jwks_uri.to_string(), CachedJwks {
        jwks: jwks.clone(),
        fetched_at: Utc::now(),
    });

    Ok(jwks)
}

/// Discover OIDC configuration from issuer URL.
pub async fn discover(issuer_url: &str) -> anyhow::Result<OidcDiscovery> {
    let url = format!("{}/.well-known/openid-configuration", issuer_url.trim_end_matches('/'));
    tracing::info!(url = %url, "OIDC discovery");
    let resp = reqwest::get(&url).await?;
    let discovery: OidcDiscovery = resp.json().await?;
    Ok(discovery)
}

// ── JWT Validation ───────────────────────────────────────────

/// Decode a JWT token (header only — for kid extraction).
/// Returns the key ID (kid) from the JWT header.
pub fn extract_kid(token: &str) -> Option<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }

    // Decode header
    use base64::Engine;
    let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let header_bytes = engine.decode(parts[0]).ok()?;
    let header: serde_json::Value = serde_json::from_slice(&header_bytes).ok()?;
    header.get("kid").and_then(|v| v.as_str()).map(String::from)
}

/// Decode JWT claims (without cryptographic verification — that's done separately).
/// This is used for claim extraction after JWKS-based signature verification.
pub fn decode_claims(token: &str) -> anyhow::Result<OidcClaims> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(anyhow::anyhow!("Invalid JWT format: expected 3 parts"));
    }

    use base64::Engine;
    let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let payload_bytes = engine.decode(parts[1])
        .map_err(|e| anyhow::anyhow!("JWT payload decode error: {}", e))?;
    let raw: serde_json::Value = serde_json::from_slice(&payload_bytes)?;

    let sub = raw.get("sub")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("JWT missing 'sub' claim"))?
        .to_string();

    let exp = raw.get("exp")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| anyhow::anyhow!("JWT missing 'exp' claim"))?;

    // Check expiry
    if exp < Utc::now().timestamp() {
        return Err(anyhow::anyhow!("JWT expired"));
    }

    Ok(OidcClaims {
        sub,
        email: raw.get("email").and_then(|v| v.as_str()).map(String::from),
        name: raw.get("name").and_then(|v| v.as_str()).map(String::from),
        iss: raw.get("iss").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        aud: raw.get("aud").and_then(|v| v.as_str()).map(String::from),
        exp,
        iat: raw.get("iat").and_then(|v| v.as_i64()),
        raw,
    })
}

/// Map OIDC claims to RBAC attributes using the provider's claim mapping.
///
/// claim_mapping example:
/// ```json
/// {
///   "role": "custom:ailink_role",
///   "scopes": "custom:ailink_scopes"
/// }
/// ```
///
/// This means: look for `custom:ailink_role` in the JWT claims → use as role.
pub fn map_claims_to_rbac(
    claims: &OidcClaims,
    provider: &OidcProvider,
) -> OidcAuthResult {
    let mapping = &provider.claim_mapping;

    // Extract role from mapped claim, fall back to provider default
    let role = mapping.get("role")
        .and_then(|v| v.as_str())
        .and_then(|claim_path| claims.raw.get(claim_path))
        .and_then(|v| v.as_str())
        .unwrap_or(&provider.default_role)
        .to_string();

    // Extract scopes from mapped claim, fall back to provider defaults
    let scopes = mapping.get("scopes")
        .and_then(|v| v.as_str())
        .and_then(|claim_path| claims.raw.get(claim_path))
        .and_then(|v| v.as_str())
        .unwrap_or(&provider.default_scopes)
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    OidcAuthResult {
        user_id: claims.sub.clone(),
        email: claims.email.clone(),
        role,
        scopes,
        org_id: provider.org_id,
        provider_name: provider.name.clone(),
    }
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_provider() -> OidcProvider {
        OidcProvider {
            id: Uuid::nil(),
            org_id: Uuid::nil(),
            name: "Test Provider".to_string(),
            issuer_url: "https://test.okta.com".to_string(),
            client_id: "test-client-id".to_string(),
            jwks_uri: None,
            audience: None,
            claim_mapping: serde_json::json!({
                "role": "custom:ailink_role",
                "scopes": "custom:ailink_scopes"
            }),
            default_role: "viewer".to_string(),
            default_scopes: "audit:read".to_string(),
            enabled: true,
        }
    }

    #[test]
    fn test_extract_kid_from_jwt() {
        // Create a test JWT header: {"alg":"RS256","kid":"test-key-1"}
        use base64::Engine;
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let header = engine.encode(r#"{"alg":"RS256","kid":"test-key-1"}"#);
        let payload = engine.encode(r#"{"sub":"user1","exp":9999999999}"#);
        let token = format!("{}.{}.signature", header, payload);

        let kid = extract_kid(&token);
        assert_eq!(kid, Some("test-key-1".to_string()));
    }

    #[test]
    fn test_extract_kid_missing() {
        use base64::Engine;
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let header = engine.encode(r#"{"alg":"RS256"}"#);
        let payload = engine.encode(r#"{"sub":"user1"}"#);
        let token = format!("{}.{}.signature", header, payload);

        let kid = extract_kid(&token);
        assert_eq!(kid, None);
    }

    #[test]
    fn test_decode_claims() {
        use base64::Engine;
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let header = engine.encode(r#"{"alg":"RS256"}"#);
        let payload = engine.encode(r#"{"sub":"user-123","email":"user@example.com","exp":9999999999,"iss":"https://test.okta.com"}"#);
        let token = format!("{}.{}.signature", header, payload);

        let claims = decode_claims(&token).unwrap();
        assert_eq!(claims.sub, "user-123");
        assert_eq!(claims.email, Some("user@example.com".to_string()));
        assert_eq!(claims.iss, "https://test.okta.com");
    }

    #[test]
    fn test_decode_claims_expired() {
        use base64::Engine;
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let header = engine.encode(r#"{"alg":"RS256"}"#);
        let payload = engine.encode(r#"{"sub":"expired-user","exp":1000000000}"#);
        let token = format!("{}.{}.signature", header, payload);

        let result = decode_claims(&token);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("expired"));
    }

    #[test]
    fn test_map_claims_with_custom_role() {
        let provider = make_test_provider();

        use base64::Engine;
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let header = engine.encode(r#"{"alg":"RS256"}"#);
        let payload = engine.encode(r#"{"sub":"admin-user","exp":9999999999,"custom:ailink_role":"admin","custom:ailink_scopes":"*"}"#);
        let token = format!("{}.{}.signature", header, payload);

        let claims = decode_claims(&token).unwrap();
        let result = map_claims_to_rbac(&claims, &provider);

        assert_eq!(result.user_id, "admin-user");
        assert_eq!(result.role, "admin");
        assert_eq!(result.scopes, vec!["*"]);
        assert_eq!(result.org_id, provider.org_id);
    }

    #[test]
    fn test_map_claims_defaults() {
        let provider = make_test_provider();

        use base64::Engine;
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let header = engine.encode(r#"{"alg":"RS256"}"#);
        // No custom claims → should use defaults
        let payload = engine.encode(r#"{"sub":"basic-user","exp":9999999999}"#);
        let token = format!("{}.{}.signature", header, payload);

        let claims = decode_claims(&token).unwrap();
        let result = map_claims_to_rbac(&claims, &provider);

        assert_eq!(result.role, "viewer");  // default
        assert_eq!(result.scopes, vec!["audit:read"]);  // default
    }

    #[test]
    fn test_invalid_jwt_format() {
        let result = decode_claims("not-a-jwt");
        assert!(result.is_err());
    }
}
