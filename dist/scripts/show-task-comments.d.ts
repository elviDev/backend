#!/usr/bin/env tsx
/**
 * Display tasks with their comments and reactions to verify the implementation
 */
declare function showTaskComments(): Promise<{
    totalTasks: number;
    tasksWithComments: number;
    totalComments: number;
    totalReactions: number;
    averageCommentsPerTask: number;
}>;
export { showTaskComments };
//# sourceMappingURL=show-task-comments.d.ts.map