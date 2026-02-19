-- Response caching: track cache hits in audit logs
ALTER TABLE audit_logs ADD COLUMN cache_hit BOOLEAN NOT NULL DEFAULT false;
