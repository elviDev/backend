import pino, { Logger } from 'pino';
export interface ContextLogger extends Logger {
    withContext(context: Record<string, unknown>): Logger;
}
export declare const logger: ContextLogger;
export declare const loggers: {
    readonly db: pino.Logger<never>;
    readonly auth: pino.Logger<never>;
    readonly api: pino.Logger<never>;
    readonly websocket: pino.Logger<never>;
    readonly cache: pino.Logger<never>;
    readonly voice: pino.Logger<never>;
    readonly ai: pino.Logger<never>;
    readonly commands: pino.Logger<never>;
    readonly analytics: pino.Logger<never>;
    readonly performance: pino.Logger<never>;
    readonly security: pino.Logger<never>;
};
export declare const performanceLogger: {
    /**
     * Track execution time of async operations
     */
    trackAsyncOperation: <T>(operation: () => Promise<T>, operationName: string, context?: Record<string, unknown>) => Promise<T>;
    /**
     * Track sync operation performance
     */
    trackSyncOperation: <T>(operation: () => T, operationName: string, context?: Record<string, unknown>) => T;
};
export declare const securityLogger: {
    /**
     * Log authentication events
     */
    logAuthEvent: (event: "login" | "logout" | "token_refresh" | "failed_login" | "login_attempt" | "registration_attempt" | "registration_success" | "password_reset_requested" | "password_reset" | "email_verified" | "token_generated" | "token_refreshed" | "authentication_success" | "refresh_token_expired" | "missing_token" | "otp_requested", context: {
        userId?: string;
        email?: string;
        ip?: string;
        userAgent?: string;
        [key: string]: unknown;
    }) => void;
    /**
     * Log authorization events
     */
    logAuthzEvent: (event: "access_granted" | "access_denied", context: {
        userId: string;
        resource: string;
        action: string;
        ip?: string;
        [key: string]: unknown;
    }) => void;
    /**
     * Log security violations
     */
    logSecurityViolation: (violation: string, context: Record<string, unknown>) => void;
};
export declare const startupLogger: {
    /**
     * Log startup steps with grouped output
     */
    logStep: (step: string, status?: "starting" | "completed" | "failed") => void;
    /**
     * Log initialization summary
     */
    logSummary: (services: Array<{
        name: string;
        status: boolean;
        duration?: number;
    }>) => void;
    /**
     * Create a startup timer
     */
    createTimer: (name: string) => {
        end: () => number;
        log: (status?: "completed" | "failed") => number;
    };
};
export declare const metricsLogger: {
    /**
     * Log metrics only when significant changes occur
     */
    logMetricsIfSignificant: (component: string, currentMetrics: Record<string, any>, previousMetrics?: Record<string, any>, threshold?: number) => void;
};
export default logger;
//# sourceMappingURL=logger.d.ts.map