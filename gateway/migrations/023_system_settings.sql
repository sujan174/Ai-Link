-- Create a table for dynamic system configuration
CREATE TABLE system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO system_settings (key, value, description)
VALUES 
    ('gateway_name', '"AILink Gateway"', 'The name displayed in the dashboard header and emails.'),
    ('admin_email', '"admin@example.com"', 'Contact email for system alerts and notifications.'),
    ('maintenance_mode', 'false', 'If true, the gateway will reject all non-admin traffic with 503 Service Unavailable.');

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to update the updated_at timestamp
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION update_system_settings_updated_at();
