//! Human-In-The-Loop (HITL) approval workflow.
//!
//! The HITL approval logic is implemented directly in [`crate::proxy::handler::proxy_handler`]:
//!
//! 1. Pre-flight policy evaluation detects `Action::RequireApproval`
//! 2. An `approval_request` row is inserted into Postgres
//! 3. The handler polls `get_approval_status` with a configurable timeout
//! 4. Admin users approve/reject via `POST /api/v1/approvals/:id/decision`
//!
//! ## Future: Redis Streams + Slack webhook
//!
//! For real-time notifications, this module will integrate:
//! - Redis Streams pub/sub for instant approval delivery
//! - Slack webhook with approve/reject action buttons
//!
//! Currently, the polling approach (500ms intervals) works well for low-volume
//! use cases. The Redis Streams upgrade will be needed for <1s latency at scale.
