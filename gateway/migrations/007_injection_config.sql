-- Add injection configuration to credentials
-- Allows dynamic auth injection: Bearer, Basic, custom header, or query param
ALTER TABLE credentials
ADD COLUMN injection_mode VARCHAR(20) NOT NULL DEFAULT 'bearer',
ADD COLUMN injection_header VARCHAR(100) NOT NULL DEFAULT 'Authorization';

-- injection_mode values:
--   'bearer' → Authorization: Bearer <key>
--   'basic'  → Authorization: Basic base64(<key>)
--   'header' → <injection_header>: <key>
--   'query'  → ?<injection_header>=<key>
