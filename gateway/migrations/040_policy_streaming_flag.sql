-- Migration 040: Add buffer_streaming_for_post_flight flag to policies
ALTER TABLE policies ADD COLUMN IF NOT EXISTS buffer_streaming_for_post_flight BOOLEAN NOT NULL DEFAULT false;
