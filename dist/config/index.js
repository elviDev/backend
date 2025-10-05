"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = require("dotenv");
const zod_1 = require("zod");
// Load environment variables
(0, dotenv_1.config)();
// Environment validation schema
const envSchema = zod_1.z.object({
    // Application
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.union([zod_1.z.string().transform(Number), zod_1.z.number()]).default(8080),
    HOST: zod_1.z.string().default('0.0.0.0'),
    // Database
    DATABASE_URL: zod_1.z.string(),
    DB_POOL_MIN: zod_1.z.string().transform(Number).default('2'),
    DB_POOL_MAX: zod_1.z.string().transform(Number).default('20'),
    // Redis
    REDIS_URL: zod_1.z.string().default('redis://localhost:6379'),
    // JWT
    JWT_SECRET: zod_1.z.string().min(32),
    JWT_REFRESH_SECRET: zod_1.z.string().min(32),
    JWT_EXPIRES_IN: zod_1.z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: zod_1.z.string().default('7d'),
    // API
    API_PREFIX: zod_1.z.string().default('/api'),
    API_VERSION: zod_1.z.string().default('v1'),
    CORS_ORIGIN: zod_1.z.string().default('*'),
    RATE_LIMIT_MAX: zod_1.z.string().transform(Number).default('100'),
    // Security
    BCRYPT_ROUNDS: zod_1.z.string().transform(Number).default('12'),
    MAX_LOGIN_ATTEMPTS: zod_1.z.string().transform(Number).default('5'),
    LOCKOUT_DURATION: zod_1.z.string().default('15m'),
    // Redis
    REDIS_HOST: zod_1.z.string().default('localhost'),
    REDIS_PORT: zod_1.z.coerce.number().default(6379),
    REDIS_PASSWORD: zod_1.z.string().optional(),
    REDIS_DB: zod_1.z.coerce.number().default(0),
    REDIS_PUBSUB_DB: zod_1.z.coerce.number().default(1),
    // Performance
    CACHE_TTL_SHORT: zod_1.z.string().default('5m'),
    CACHE_TTL_MEDIUM: zod_1.z.string().default('1h'),
    CACHE_TTL_LONG: zod_1.z.string().default('24h'),
    QUERY_TIMEOUT: zod_1.z.string().default('30s'),
    REQUEST_TIMEOUT: zod_1.z.string().default('30s'),
    // Logging
    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    LOG_FORMAT: zod_1.z.enum(['json', 'pretty']).default('json'),
    // Development
    DEBUG_SQL: zod_1.z.string().transform(Boolean).default('false'),
    DEBUG_WEBSOCKET: zod_1.z.string().transform(Boolean).default('false'),
});
// Validate and export configuration
const env = envSchema.parse(process.env);
exports.config = {
    // Application settings
    app: {
        env: env.NODE_ENV,
        port: env.PORT,
        host: env.HOST,
        isDevelopment: env.NODE_ENV === 'development',
        isProduction: env.NODE_ENV === 'production',
        isTest: env.NODE_ENV === 'test',
    },
    // Database configuration
    database: {
        url: env.DATABASE_URL,
        pool: {
            min: env.DB_POOL_MIN,
            max: env.DB_POOL_MAX,
        },
        options: {
            parseInputDatesAsUTC: true,
            ssl: env.NODE_ENV === 'production',
        },
    },
    // Redis configuration
    redis: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        db: env.REDIS_DB,
        pubSubDb: env.REDIS_PUBSUB_DB,
        options: {
            retryDelayOnFailover: 100,
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
            lazyConnect: true,
        },
    },
    // JWT configuration
    jwt: {
        secret: env.JWT_SECRET,
        refreshSecret: env.JWT_REFRESH_SECRET,
        expiresIn: env.JWT_EXPIRES_IN,
        refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    },
    // API configuration
    api: {
        prefix: env.API_PREFIX,
        version: env.API_VERSION,
        cors: {
            origin: env.CORS_ORIGIN.split(','),
            credentials: true,
        },
        rateLimit: {
            max: env.RATE_LIMIT_MAX,
            timeWindow: '15 minutes',
        },
    },
    // Security configuration
    security: {
        bcryptRounds: env.BCRYPT_ROUNDS,
        maxLoginAttempts: env.MAX_LOGIN_ATTEMPTS,
        lockoutDuration: env.LOCKOUT_DURATION,
    },
    // Performance configuration
    performance: {
        cache: {
            ttl: {
                short: env.CACHE_TTL_SHORT,
                medium: env.CACHE_TTL_MEDIUM,
                long: env.CACHE_TTL_LONG,
            },
        },
        timeouts: {
            query: env.QUERY_TIMEOUT,
            request: env.REQUEST_TIMEOUT,
        },
    },
    // Logging configuration
    logging: {
        level: env.LOG_LEVEL,
        format: env.LOG_FORMAT,
    },
    // Development configuration
    development: {
        debugSql: env.DEBUG_SQL,
        debugWebSocket: env.DEBUG_WEBSOCKET,
    },
};
//# sourceMappingURL=index.js.map