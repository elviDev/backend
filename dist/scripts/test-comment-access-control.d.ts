#!/usr/bin/env tsx
/**
 * Test comment access control implementation
 * Verify that only task assignees and owners can comment on tasks
 */
interface TestResult {
    scenario: string;
    user: string;
    task: string;
    action: string;
    expected: 'SUCCESS' | 'DENIED';
    actual: 'SUCCESS' | 'DENIED';
    passed: boolean;
}
declare function testCommentAccessControl(): Promise<{
    totalTests: number;
    passedTests: number;
    failedTests: number;
    successRate: number;
    results: TestResult[];
}>;
export { testCommentAccessControl };
//# sourceMappingURL=test-comment-access-control.d.ts.map