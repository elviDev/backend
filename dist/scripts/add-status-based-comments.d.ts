#!/usr/bin/env tsx
declare function addStatusBasedComments(): Promise<{
    tasksProcessed: number;
    commentsAdded: number;
    statusBreakdown: Record<string, number>;
}>;
export { addStatusBasedComments };
//# sourceMappingURL=add-status-based-comments.d.ts.map