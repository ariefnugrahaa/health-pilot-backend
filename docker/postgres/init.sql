-- HealthPilot PostgreSQL Initialization Script
-- This script runs when the PostgreSQL container is first created

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create additional schemas if needed
-- CREATE SCHEMA IF NOT EXISTS audit;

-- Grant permissions
-- GRANT ALL PRIVILEGES ON SCHEMA audit TO healthpilot;

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'HealthPilot database initialized successfully at %', NOW();
END $$;
