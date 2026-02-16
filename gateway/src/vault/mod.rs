pub mod aws_kms;
pub mod builtin;
pub mod hashicorp;

use async_trait::async_trait;

/// Abstraction over secret storage backends.
/// Implementations: BuiltinStore (AES-256-GCM in PG), HashiCorp Vault, AWS KMS.
#[async_trait]
pub trait SecretStore: Send + Sync {
    /// Encrypt and store a secret. Returns the storage ID.
    #[allow(dead_code)]
    async fn store(&self, plaintext: &str) -> anyhow::Result<String>;

    /// Retrieve and decrypt a secret by its storage ID.
    /// Returns (plaintext_secret, provider, injection_mode, injection_header).
    async fn retrieve(&self, id: &str) -> anyhow::Result<(String, String, String, String)>;

    /// Delete a stored secret.
    #[allow(dead_code)]
    async fn delete(&self, id: &str) -> anyhow::Result<()>;
}
