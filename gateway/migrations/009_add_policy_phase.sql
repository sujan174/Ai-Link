-- Add phase column to policies table
ALTER TABLE policies ADD COLUMN phase VARCHAR(10) NOT NULL DEFAULT 'pre';

-- Ensure only valid phases are allowed
ALTER TABLE policies ADD CONSTRAINT policies_phase_check CHECK (phase IN ('pre', 'post'));
