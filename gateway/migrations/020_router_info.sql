-- Router debugger: store model routing metadata in audit logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS router_info JSONB;
