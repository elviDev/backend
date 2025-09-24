#!/usr/bin/env tsx
/**
 * Count total tasks in the database
 */
declare function countTasks(): Promise<{
    total: number;
    retrieved: number;
    hasMore: boolean;
    statusBreakdown: Record<string, number>;
    channelBreakdown: Record<string, number>;
    orphanedTasks: number;
}>;
export { countTasks };
//# sourceMappingURL=count-tasks.d.ts.map