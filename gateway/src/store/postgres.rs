use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

pub struct PgStore {
    pool: PgPool,
}

impl PgStore {
    pub async fn connect(database_url: &str) -> anyhow::Result<Self> {
        let pool = PgPool::connect(database_url).await?;
        Ok(Self { pool })
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Run pending migrations from the migrations/ directory.
    pub async fn migrate(&self) -> anyhow::Result<()> {
        sqlx::migrate!("./migrations").run(&self.pool).await?;
        Ok(())
    }

    // -- Project Operations --

    pub async fn create_project(&self, org_id: Uuid, name: &str) -> anyhow::Result<Uuid> {
        let id = sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO projects (org_id, name) VALUES ($1, $2) RETURNING id",
        )
        .bind(org_id)
        .bind(name)
        .fetch_one(&self.pool)
        .await?;
        Ok(id)
    }

    pub async fn list_projects(&self, org_id: Uuid) -> anyhow::Result<Vec<ProjectRow>> {
        let rows = sqlx::query_as::<_, ProjectRow>(
            "SELECT id, org_id, name, created_at FROM projects WHERE org_id = $1 ORDER BY created_at ASC"
        )
        .bind(org_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    // -- Credential Operations --

    pub async fn insert_credential(&self, cred: &NewCredential) -> anyhow::Result<Uuid> {
        let id = sqlx::query_scalar::<_, Uuid>(
            r#"INSERT INTO credentials (project_id, name, provider, encrypted_dek, dek_nonce, encrypted_secret, secret_nonce, injection_mode, injection_header)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING id"#
        )
        .bind(cred.project_id)
        .bind(&cred.name)
        .bind(&cred.provider)
        .bind(&cred.encrypted_dek)
        .bind(&cred.dek_nonce)
        .bind(&cred.encrypted_secret)
        .bind(&cred.secret_nonce)
        .bind(&cred.injection_mode)
        .bind(&cred.injection_header)
        .fetch_one(&self.pool)
        .await?;

        Ok(id)
    }

    pub async fn list_credentials(&self, project_id: Uuid) -> anyhow::Result<Vec<CredentialMeta>> {
        let rows = sqlx::query_as::<_, CredentialMeta>(
            "SELECT id, name, provider, version, is_active, created_at FROM credentials WHERE project_id = $1 ORDER BY created_at DESC"
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    // -- Token Operations --

    pub async fn insert_token(&self, token: &NewToken) -> anyhow::Result<()> {
        sqlx::query(
            r#"INSERT INTO tokens (id, project_id, name, credential_id, upstream_url, scopes, policy_ids)
               VALUES ($1, $2, $3, $4, $5, $6, $7)"#
        )
        .bind(&token.id)
        .bind(token.project_id)
        .bind(&token.name)
        .bind(token.credential_id)
        .bind(&token.upstream_url)
        .bind(&token.scopes)
        .bind(&token.policy_ids)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_token(&self, token_id: &str) -> anyhow::Result<Option<TokenRow>> {
        let row = sqlx::query_as::<_, TokenRow>(
            "SELECT id, project_id, name, credential_id, upstream_url, scopes, policy_ids, is_active, created_at FROM tokens WHERE id = $1"
        )
        .bind(token_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    pub async fn list_tokens(&self, project_id: Uuid) -> anyhow::Result<Vec<TokenRow>> {
        let rows = sqlx::query_as::<_, TokenRow>(
            "SELECT id, project_id, name, credential_id, upstream_url, scopes, policy_ids, is_active, created_at FROM tokens WHERE project_id = $1 ORDER BY created_at DESC"
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    pub async fn revoke_token(&self, token_id: &str) -> anyhow::Result<bool> {
        let result =
            sqlx::query("UPDATE tokens SET is_active = false, updated_at = NOW() WHERE id = $1")
                .bind(token_id)
                .execute(&self.pool)
                .await?;

        Ok(result.rows_affected() > 0)
    }

    // -- Policy Operations --

    pub async fn get_policies_for_token(
        &self,
        policy_ids: &[Uuid],
    ) -> anyhow::Result<Vec<crate::models::policy::Policy>> {
        if policy_ids.is_empty() {
            return Ok(vec![]);
        }

        let rows = sqlx::query_as::<_, PolicyRow>(
            "SELECT id, project_id, name, mode, rules, is_active, created_at FROM policies WHERE id = ANY($1) AND is_active = true"
        )
        .bind(policy_ids)
        .fetch_all(&self.pool)
        .await?;

        let mut policies = Vec::new();
        for row in rows {
            let mode = match row.mode.as_str() {
                "shadow" => crate::models::policy::PolicyMode::Shadow,
                _ => crate::models::policy::PolicyMode::Enforce,
            };
            let rules: Vec<crate::models::policy::Rule> = serde_json::from_value(row.rules)?;
            policies.push(crate::models::policy::Policy {
                id: row.id,
                name: row.name,
                phase: crate::models::policy::Phase::Pre, // default, can be overridden via rules JSON
                mode,
                rules,
            });
        }

        Ok(policies)
    }

    pub async fn list_policies(&self, project_id: Uuid) -> anyhow::Result<Vec<PolicyRow>> {
        let rows = sqlx::query_as::<_, PolicyRow>(
            "SELECT id, project_id, name, mode, rules, is_active, created_at FROM policies WHERE project_id = $1 ORDER BY created_at DESC"
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn insert_policy(
        &self,
        project_id: Uuid,
        name: &str,
        mode: &str,
        rules: serde_json::Value,
    ) -> anyhow::Result<Uuid> {
        let id = sqlx::query_scalar::<_, Uuid>(
            r#"INSERT INTO policies (project_id, name, mode, rules)
               VALUES ($1, $2, $3, $4)
               RETURNING id"#,
        )
        .bind(project_id)
        .bind(name)
        .bind(mode)
        .bind(rules)
        .fetch_one(&self.pool)
        .await?;
        Ok(id)
    }

    pub async fn update_policy(
        &self,
        id: Uuid,
        project_id: Uuid,
        mode: Option<&str>,
        rules: Option<serde_json::Value>,
        name: Option<&str>,
    ) -> anyhow::Result<bool> {
        // Build dynamic update — at least one field must change
        let result = sqlx::query(
            r#"UPDATE policies
               SET mode = COALESCE($1, mode),
                   rules = COALESCE($2, rules),
                   name = COALESCE($3, name)
               WHERE id = $4 AND project_id = $5 AND is_active = true"#,
        )
        .bind(mode)
        .bind(rules)
        .bind(name)
        .bind(id)
        .bind(project_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn delete_policy(&self, id: Uuid, project_id: Uuid) -> anyhow::Result<bool> {
        let result = sqlx::query(
            "UPDATE policies SET is_active = false WHERE id = $1 AND project_id = $2 AND is_active = true"
        )
        .bind(id)
        .bind(project_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // -- Approval Operations --

    pub async fn create_approval_request(
        &self,
        token_id: &str,
        project_id: Uuid,
        idempotency_key: Option<String>,
        summary: serde_json::Value,
        expires_at: DateTime<Utc>,
    ) -> anyhow::Result<Uuid> {
        // Optimistic insert
        let id_opt = sqlx::query_scalar::<_, Uuid>(
            r#"INSERT INTO approval_requests (token_id, project_id, idempotency_key, request_summary, expires_at)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (token_id, idempotency_key) DO NOTHING
               RETURNING id"#
        )
        .bind(token_id)
        .bind(project_id)
        .bind(&idempotency_key)
        .bind(summary)
        .bind(expires_at)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!("create_approval_request insert failed: {:?}", e);
            e
        })?;

        if let Some(id) = id_opt {
            Ok(id)
        } else {
            // Conflict -> fetch existing
            let existing_id = sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM approval_requests WHERE token_id = $1 AND idempotency_key = $2",
            )
            .bind(token_id)
            .bind(&idempotency_key)
            .fetch_one(&self.pool)
            .await?;
            Ok(existing_id)
        }
    }

    pub async fn get_approval_status(&self, request_id: Uuid) -> anyhow::Result<String> {
        let status: String =
            sqlx::query_scalar("SELECT status FROM approval_requests WHERE id = $1")
                .bind(request_id)
                .fetch_one(&self.pool)
                .await?;
        Ok(status)
    }

    pub async fn list_pending_approvals(
        &self,
        project_id: Uuid,
    ) -> anyhow::Result<Vec<crate::models::approval::ApprovalRequest>> {
        let rows = sqlx::query_as::<_, crate::models::approval::ApprovalRequest>(
            "SELECT * FROM approval_requests WHERE project_id = $1 AND status = 'pending' ORDER BY created_at ASC"
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn update_approval_status(
        &self,
        request_id: Uuid,
        project_id: Uuid,
        status: crate::models::approval::ApprovalStatus,
    ) -> anyhow::Result<bool> {
        let result = sqlx::query("UPDATE approval_requests SET status = $1, reviewed_at = NOW() WHERE id = $2 AND project_id = $3 AND status = 'pending'")
        .bind(status)
        .bind(request_id)
        .bind(project_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // -- Audit Log Operations --

    pub async fn list_audit_logs(
        &self,
        project_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> anyhow::Result<Vec<AuditLogRow>> {
        let rows = sqlx::query_as::<_, AuditLogRow>(
            r#"SELECT id, created_at, token_id, method, path, upstream_status,
                      response_latency_ms, agent_name, policy_result, estimated_cost_usd,
                      shadow_violations, fields_redacted
               FROM audit_logs
               WHERE project_id = $1
               ORDER BY created_at DESC
               LIMIT $2 OFFSET $3"#,
        )
        .bind(project_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    // -- Analytics Operations --

    pub async fn get_request_volume_24h(
        &self,
        project_id: Uuid,
    ) -> anyhow::Result<Vec<crate::models::analytics::VolumeStat>> {
        let rows = sqlx::query_as::<_, crate::models::analytics::VolumeStat>(
            r#"
            SELECT 
                date_trunc('hour', created_at) as bucket,
                count(*) as count
            FROM audit_logs
            WHERE project_id = $1 AND created_at > now() - interval '24 hours'
            GROUP BY 1
            ORDER BY 1 ASC
            "#,
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn get_status_code_distribution_24h(
        &self,
        project_id: Uuid,
    ) -> anyhow::Result<Vec<crate::models::analytics::StatusStat>> {
        let rows = sqlx::query_as::<_, crate::models::analytics::StatusStat>(
            r#"
            SELECT 
                CAST(floor(COALESCE(upstream_status, 0) / 100) * 100 AS INTEGER) as status_class,
                count(*) as count
            FROM audit_logs
            WHERE project_id = $1 AND created_at > now() - interval '24 hours'
            GROUP BY 1
            ORDER BY 1 ASC
            "#,
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn get_latency_percentiles_24h(
        &self,
        project_id: Uuid,
    ) -> anyhow::Result<crate::models::analytics::LatencyStat> {
        // We use percentile_cont. Requires float8, response_latency_ms is int4.
        // We return a single row with p50, p90, p99, avg.
        let row = sqlx::query_as::<_, crate::models::analytics::LatencyStat>(
            r#"
            SELECT 
                COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY response_latency_ms), 0)::float8 as p50,
                COALESCE(percentile_cont(0.90) WITHIN GROUP (ORDER BY response_latency_ms), 0)::float8 as p90,
                COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY response_latency_ms), 0)::float8 as p99,
                COALESCE(AVG(response_latency_ms)::float8, 0) as avg
            FROM audit_logs
            WHERE project_id = $1 AND created_at > now() - interval '24 hours'
            "#
        )
        .bind(project_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(row)
    }
}

// -- Input structs --

pub struct NewCredential {
    pub project_id: Uuid,
    pub name: String,
    pub provider: String,
    pub encrypted_dek: Vec<u8>,
    pub dek_nonce: Vec<u8>,
    pub encrypted_secret: Vec<u8>,
    pub secret_nonce: Vec<u8>,
    pub injection_mode: String,
    pub injection_header: String,
}

pub struct NewToken {
    pub id: String,
    pub project_id: Uuid,
    pub name: String,
    pub credential_id: Uuid,
    pub upstream_url: String,
    pub scopes: serde_json::Value,
    pub policy_ids: Vec<Uuid>,
}

// -- Output structs --

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize)]
pub struct CredentialMeta {
    pub id: Uuid,
    pub name: String,
    pub provider: String,
    pub version: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize)]
pub struct TokenRow {
    pub id: String,
    pub project_id: Uuid,
    pub name: String,
    pub credential_id: Uuid,
    pub upstream_url: String,
    pub scopes: serde_json::Value,
    pub policy_ids: Vec<Uuid>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize)]
pub struct PolicyRow {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub mode: String,
    pub rules: serde_json::Value,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize)]
pub struct AuditLogRow {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub token_id: Option<String>,
    pub method: String,
    pub path: String,
    pub upstream_status: Option<i16>,
    pub response_latency_ms: i32,
    pub agent_name: Option<String>,
    pub policy_result: String,
    pub estimated_cost_usd: Option<rust_decimal::Decimal>,
    pub shadow_violations: Option<Vec<String>>,
    pub fields_redacted: Option<Vec<String>>,
}

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize)]
pub struct ProjectRow {
    pub id: Uuid,
    pub org_id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
}
