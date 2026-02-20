-- Migration 025: Add experiment tracking columns to audit_logs
-- Used by the Split policy action for A/B test analysis

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS experiment_name TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS variant_name TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_experiment
    ON audit_logs(experiment_name)
    WHERE experiment_name IS NOT NULL;

COMMENT ON COLUMN audit_logs.experiment_name IS
    'Experiment name set by the Split policy action for A/B analysis grouping.';
COMMENT ON COLUMN audit_logs.variant_name IS
    'Variant label (e.g. "control" / "experiment") assigned by the Split policy action.';
