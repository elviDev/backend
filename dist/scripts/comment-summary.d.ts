#!/usr/bin/env tsx
/**
 * Show comprehensive comment summary by task status
 */
declare function showCommentSummary(): Promise<{
    totalTasks: number;
    totalComments: number;
    statusBreakdown: {
        [k: string]: number;
    };
}>;
export { showCommentSummary };
//# sourceMappingURL=comment-summary.d.ts.map