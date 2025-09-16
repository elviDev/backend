export declare const config: {
    readonly app: {
        readonly env: "development" | "test" | "production";
        readonly port: number;
        readonly host: string;
        readonly isDevelopment: boolean;
        readonly isProduction: boolean;
        readonly isTest: boolean;
    };
    readonly database: {
        readonly url: string;
        readonly pool: {
            readonly min: number;
            readonly max: number;
        };
        readonly options: {
            readonly parseInputDatesAsUTC: true;
            readonly ssl: boolean;
        };
    };
    readonly redis: {
        readonly host: string;
        readonly port: number;
        readonly password: string | undefined;
        readonly db: number;
        readonly pubSubDb: number;
        readonly options: {
            readonly retryDelayOnFailover: 100;
            readonly enableReadyCheck: false;
            readonly maxRetriesPerRequest: null;
            readonly lazyConnect: true;
        };
    };
    readonly jwt: {
        readonly secret: string;
        readonly refreshSecret: string;
        readonly expiresIn: string;
        readonly refreshExpiresIn: string;
    };
    readonly api: {
        readonly prefix: string;
        readonly version: string;
        readonly cors: {
            readonly origin: string[];
            readonly credentials: true;
        };
        readonly rateLimit: {
            readonly max: number;
            readonly timeWindow: "15 minutes";
        };
    };
    readonly security: {
        readonly bcryptRounds: number;
        readonly maxLoginAttempts: number;
        readonly lockoutDuration: string;
    };
    readonly performance: {
        readonly cache: {
            readonly ttl: {
                readonly short: string;
                readonly medium: string;
                readonly long: string;
            };
        };
        readonly timeouts: {
            readonly query: string;
            readonly request: string;
        };
    };
    readonly logging: {
        readonly level: "error" | "warn" | "info" | "debug";
        readonly format: "json" | "pretty";
    };
    readonly development: {
        readonly seedDatabase: boolean;
        readonly debugSql: boolean;
        readonly debugWebSocket: boolean;
    };
};
export type Config = typeof config;
export type AppEnv = typeof config.app.env;
//# sourceMappingURL=index.d.ts.map