interface MigrationRecord {
    id: string;
    filename: string;
    executed_at: Date;
    checksum: string;
}
/**
 * Run all pending migrations
 */
export declare const runMigrations: () => Promise<void>;
/**
 * Rollback the last migration (for development only)
 */
export declare const rollbackLastMigration: () => Promise<void>;
/**
 * Get migration status for health checks
 */
export declare const getMigrationStatus: () => Promise<{
    total: number;
    executed: number;
    pending: number;
    lastExecuted: MigrationRecord | undefined;
}>;
/**
 * Validate migration integrity
 */
export declare const validateMigrations: () => Promise<{
    valid: boolean;
    errors: string[];
}>;
export {};
//# sourceMappingURL=migrator.d.ts.map