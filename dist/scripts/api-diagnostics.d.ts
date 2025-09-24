#!/usr/bin/env tsx
/**
 * API Diagnostics - Check what data is available for frontend
 */
declare function runDiagnostics(): Promise<{
    users: number;
    channels: number;
    tasks: number;
    baseUrl: string;
    sampleChannels: {
        id: string;
        name: string;
    }[];
    sampleTasks: {
        id: string;
        title: string;
        channel_id: string | undefined;
    }[];
}>;
export { runDiagnostics };
//# sourceMappingURL=api-diagnostics.d.ts.map