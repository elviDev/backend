-- PostgreSQL initialization script for CEO Communication Platform
-- Optimizes database for high-performance voice processing and real-time collaboration

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set optimal configuration for development
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.track = 'all';
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_duration = 'on';
ALTER SYSTEM SET log_min_duration_statement = 100;

-- Create schema for application
CREATE SCHEMA IF NOT EXISTS app;

-- Set search path
ALTER DATABASE ceo_platform SET search_path TO app, public;

-- Performance optimizations
ALTER DATABASE ceo_platform SET random_page_cost = 1.1;
ALTER DATABASE ceo_platform SET effective_cache_size = '1GB';
ALTER DATABASE ceo_platform SET work_mem = '4MB';

-- Enable query plan caching
ALTER DATABASE ceo_platform SET plan_cache_mode = 'force_generic_plan';

COMMIT;