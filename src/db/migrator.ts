import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { getPool, query, transaction } from '@config/database';
import { logger } from '@utils/logger';
import { DatabaseError } from '@utils/errors';

/**
 * Database migration system for CEO Communication Platform
 * Handles schema evolution across all development phases
 */

interface Migration {
  id: string;
  filename: string;
  timestamp: number;
  sql: string;
}

interface MigrationRecord {
  id: string;
  filename: string;
  executed_at: Date;
  checksum: string;
}

/**
 * Initialize migration tracking table
 */
const initializeMigrationTable = async (): Promise<void> => {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS migrations (
      id VARCHAR(255) PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      checksum VARCHAR(64) NOT NULL,
      execution_time_ms INTEGER,
      UNIQUE(filename)
    );
    
    CREATE INDEX IF NOT EXISTS idx_migrations_executed_at ON migrations(executed_at);
  `;

  await query(createTableSql);
  logger.info('Migration tracking table initialized');
};

/**
 * Load migration files from the migrations directory
 */
const loadMigrationFiles = async (): Promise<Migration[]> => {
  try {
    const migrationsDir = join(process.cwd(), 'migrations');
    const files = await readdir(migrationsDir);

    const sqlFiles = files.filter((file) => file.endsWith('.sql')).sort(); // Ensure proper ordering

    const migrations: Migration[] = [];

    for (const filename of sqlFiles) {
      const filepath = join(migrationsDir, filename);
      const sql = await readFile(filepath, 'utf-8');

      // Extract timestamp from filename (format: YYYYMMDDHHMMSS_name.sql)
      const timestampMatch = filename.match(/^(\d{14})/);
      const timestamp = timestampMatch && timestampMatch[1] ? parseInt(timestampMatch[1], 10) : 0;

      migrations.push({
        id: filename.replace('.sql', ''),
        filename,
        timestamp,
        sql: sql.trim(),
      });
    }

    logger.info({ count: migrations.length }, 'Loaded migration files');
    return migrations;
  } catch (error) {
    logger.error({ error }, 'Failed to load migration files');
    throw new DatabaseError('Failed to load migration files');
  }
};

/**
 * Get executed migrations from database
 */
const getExecutedMigrations = async (): Promise<MigrationRecord[]> => {
  const result = await query<MigrationRecord>('SELECT * FROM migrations ORDER BY executed_at ASC');

  return result.rows;
};

/**
 * Calculate checksum for migration content
 */
const calculateChecksum = (content: string): string => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
};

/**
 * Execute a single migration
 */
const executeMigration = async (migration: Migration): Promise<void> => {
  const startTime = Date.now();

  await transaction(async (client) => {
    logger.info({ migration: migration.filename }, 'Executing migration');

    // Execute the migration SQL
    await client.query(migration.sql);

    // Record the migration execution
    const executionTime = Date.now() - startTime;
    const checksum = calculateChecksum(migration.sql);

    await client.query(
      `INSERT INTO migrations (id, filename, executed_at, checksum, execution_time_ms)
       VALUES ($1, $2, NOW(), $3, $4)`,
      [migration.id, migration.filename, checksum, executionTime]
    );

    logger.info(
      {
        migration: migration.filename,
        executionTime,
      },
      'Migration executed successfully'
    );
  });
};

/**
 * Run all pending migrations
 */
export const runMigrations = async (): Promise<void> => {
  try {
    logger.info('Starting database migrations...');

    // Initialize migration tracking
    await initializeMigrationTable();

    // Load all migration files
    const allMigrations = await loadMigrationFiles();

    // Get executed migrations
    const executedMigrations = await getExecutedMigrations();
    const executedIds = new Set(executedMigrations.map((m) => m.id));

    // Find pending migrations
    const pendingMigrations = allMigrations.filter((m) => !executedIds.has(m.id));

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations found');
      return;
    }

    logger.info(
      {
        total: allMigrations.length,
        executed: executedMigrations.length,
        pending: pendingMigrations.length,
      },
      'Migration status'
    );

    // Execute pending migrations in order
    for (const migration of pendingMigrations) {
      await executeMigration(migration);
    }

    logger.info(
      {
        executedCount: pendingMigrations.length,
      },
      'All migrations completed successfully'
    );
  } catch (error) {
    logger.error({ error }, 'Migration failed');
    throw new DatabaseError('Migration execution failed');
  }
};

/**
 * Rollback the last migration (for development only)
 */
export const rollbackLastMigration = async (): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    throw new DatabaseError('Rollback not allowed in production');
  }

  try {
    const executedMigrations = await getExecutedMigrations();

    if (executedMigrations.length === 0) {
      logger.info('No migrations to rollback');
      return;
    }

    const lastMigration = executedMigrations[executedMigrations.length - 1];

    if (!lastMigration) {
      logger.info('No migrations to rollback');
      return;
    }

    // Check if rollback SQL exists
    const rollbackFilename = lastMigration.filename.replace('.sql', '.rollback.sql');
    const rollbackPath = join(process.cwd(), 'migrations', rollbackFilename);

    try {
      const rollbackSql = await readFile(rollbackPath, 'utf-8');

      await transaction(async (client) => {
        logger.warn({ migration: lastMigration.filename }, 'Rolling back migration');

        // Execute rollback SQL
        await client.query(rollbackSql);

        // Remove from migration records
        await client.query('DELETE FROM migrations WHERE id = $1', [lastMigration.id]);

        logger.warn(
          {
            migration: lastMigration.filename,
          },
          'Migration rolled back successfully'
        );
      });
    } catch (rollbackError) {
      throw new DatabaseError(`Rollback file not found or invalid: ${rollbackFilename}`, {
        lastMigration: lastMigration.filename,
      });
    }
  } catch (error) {
    logger.error({ error }, 'Rollback failed');
    throw new DatabaseError('Migration rollback failed');
  }
};

/**
 * Get migration status for health checks
 */
export const getMigrationStatus = async (): Promise<{
  total: number;
  executed: number;
  pending: number;
  lastExecuted: MigrationRecord | undefined;
}> => {
  try {
    const allMigrations = await loadMigrationFiles();
    const executedMigrations = await getExecutedMigrations();

    return {
      total: allMigrations.length,
      executed: executedMigrations.length,
      pending: allMigrations.length - executedMigrations.length,
      lastExecuted: executedMigrations[executedMigrations.length - 1],
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get migration status');
    throw new DatabaseError('Failed to get migration status');
  }
};

/**
 * Validate migration integrity
 */
export const validateMigrations = async (): Promise<{
  valid: boolean;
  errors: string[];
}> => {
  const errors: string[] = [];

  try {
    const allMigrations = await loadMigrationFiles();
    const executedMigrations = await getExecutedMigrations();

    // Check for checksum mismatches
    for (const executed of executedMigrations) {
      const migration = allMigrations.find((m) => m.id === executed.id);

      if (!migration) {
        errors.push(`Migration ${executed.filename} was executed but file no longer exists`);
        continue;
      }

      const currentChecksum = calculateChecksum(migration.sql);
      if (currentChecksum !== executed.checksum) {
        errors.push(`Migration ${executed.filename} has been modified after execution`);
      }
    }

    // Check for gaps in migration sequence
    const timestamps = allMigrations
      .map((m) => m.timestamp)
      .filter((t): t is number => typeof t === 'number')
      .sort();
    for (let i = 1; i < timestamps.length; i++) {
      const current = timestamps[i];
      const previous = timestamps[i - 1];
      if (typeof current === 'number' && typeof previous === 'number' && current <= previous) {
        errors.push(`Migration timestamp ordering issue detected`);
        break;
      }
    }
  } catch (error) {
    errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
