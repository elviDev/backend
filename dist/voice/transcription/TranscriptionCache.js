"use strict";
/**
 * Transcription Cache - Phase 2 Voice Processing
 * Redis-based caching for Whisper API responses
 *
 * Success Criteria:
 * - Audio fingerprinting for cache keys
 * - 1-hour cache TTL for transcripts
 * - 30% cache hit rate after 1 week of usage
 * - <10ms cache lookup time
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranscriptionCache = void 0;
const crypto_1 = require("crypto");
const perf_hooks_1 = require("perf_hooks");
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../../utils/logger");
class TranscriptionCache {
    redis;
    keyPrefix = 'whisper:cache:';
    defaultTTL = 3600; // 1 hour
    // Statistics
    hits = 0;
    misses = 0;
    lookupTimes = [];
    constructor() {
        this.redis = new ioredis_1.default({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            db: parseInt(process.env.REDIS_CACHE_DB || '1'), // Use separate DB for cache
            keyPrefix: this.keyPrefix,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            enableReadyCheck: true,
        });
        this.redis.on('connect', () => {
            logger_1.logger.info('Transcription cache connected to Redis');
        });
        this.redis.on('error', (error) => {
            logger_1.logger.error('Transcription cache Redis error', { error: error.message });
        });
        logger_1.logger.debug('Transcription cache initialized');
    }
    /**
     * Generate cache key from audio buffer and options
     * Uses audio fingerprinting for consistent keys
     */
    generateCacheKey(audioBuffer, options) {
        // Create hash of audio content
        const audioHash = this.generateAudioFingerprint(audioBuffer);
        // Include relevant options in key
        const optionsKey = JSON.stringify({
            language: options.language || 'auto',
            temperature: options.temperature || 0,
            responseFormat: options.responseFormat || 'verbose_json',
        });
        const optionsHash = (0, crypto_1.createHash)('md5').update(optionsKey).digest('hex').substring(0, 8);
        return `${audioHash}:${optionsHash}`;
    }
    /**
     * Get cached transcription result
     * Target: <10ms lookup time
     */
    async get(key) {
        const startTime = perf_hooks_1.performance.now();
        try {
            const cached = await this.redis.get(key);
            const lookupTime = perf_hooks_1.performance.now() - startTime;
            this.recordLookupTime(lookupTime);
            if (cached) {
                this.hits++;
                // Extend TTL on cache hit
                await this.redis.expire(key, this.defaultTTL);
                const result = JSON.parse(cached);
                logger_1.logger.debug('Cache hit', {
                    key,
                    lookupTime: `${lookupTime.toFixed(2)}ms`,
                    transcriptLength: result.transcript.length,
                });
                return result;
            }
            else {
                this.misses++;
                logger_1.logger.debug('Cache miss', {
                    key,
                    lookupTime: `${lookupTime.toFixed(2)}ms`,
                });
                return null;
            }
        }
        catch (error) {
            const lookupTime = perf_hooks_1.performance.now() - startTime;
            this.misses++;
            this.recordLookupTime(lookupTime);
            logger_1.logger.error('Cache lookup failed', {
                key,
                error: error.message,
                lookupTime: `${lookupTime.toFixed(2)}ms`,
            });
            return null;
        }
    }
    /**
     * Cache transcription result
     */
    async set(key, result, ttl) {
        try {
            const cacheData = {
                ...result,
                cachedAt: new Date().toISOString(),
                // Remove processingTime from cache (will be recalculated)
                processingTime: undefined,
            };
            await this.redis.setex(key, ttl || this.defaultTTL, JSON.stringify(cacheData));
            logger_1.logger.debug('Result cached', {
                key,
                ttl: ttl || this.defaultTTL,
                transcriptLength: result.transcript.length,
                confidence: result.confidence,
            });
        }
        catch (error) {
            logger_1.logger.error('Cache set failed', {
                key,
                error: error.message,
            });
        }
    }
    /**
     * Delete cached result
     */
    async delete(key) {
        try {
            await this.redis.del(key);
            logger_1.logger.debug('Cache entry deleted', { key });
        }
        catch (error) {
            logger_1.logger.error('Cache delete failed', {
                key,
                error: error.message,
            });
        }
    }
    /**
     * Clear all cached results
     */
    async clear() {
        try {
            const keys = await this.redis.keys('*');
            if (keys.length > 0) {
                await this.redis.del(...keys);
                logger_1.logger.info('Cache cleared', { deletedKeys: keys.length });
            }
        }
        catch (error) {
            logger_1.logger.error('Cache clear failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    /**
     * Get cache statistics
     */
    getStats() {
        const totalRequests = this.hits + this.misses;
        const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;
        const avgLookupTime = this.lookupTimes.length > 0
            ? this.lookupTimes.reduce((sum, time) => sum + time, 0) / this.lookupTimes.length
            : 0;
        return {
            hits: this.hits,
            misses: this.misses,
            hitRate: Math.round(hitRate * 100) / 100,
            averageLookupTime: Math.round(avgLookupTime * 100) / 100,
            totalKeys: 0, // Will be populated by getTotalKeys() if needed
            memoryUsage: 0, // Will be populated by getMemoryUsage() if needed
        };
    }
    /**
     * Get total number of cached keys
     */
    async getTotalKeys() {
        try {
            const keys = await this.redis.keys('*');
            return keys.length;
        }
        catch (error) {
            logger_1.logger.error('Failed to get total keys', {
                error: error instanceof Error ? error.message : String(error),
            });
            return 0;
        }
    }
    /**
     * Get memory usage information
     */
    async getMemoryUsage() {
        try {
            const info = await this.redis.memory('USAGE', this.keyPrefix + '*');
            return info || 0;
        }
        catch (error) {
            logger_1.logger.error('Failed to get memory usage', {
                error: error instanceof Error ? error.message : String(error),
            });
            return 0;
        }
    }
    /**
     * Preload cache with common transcriptions
     */
    async preload(commonPhrases) {
        logger_1.logger.info('Starting cache preload', { phrasesCount: commonPhrases.length });
        const preloadPromises = commonPhrases.map(async ({ audio, transcript }) => {
            const key = this.generateCacheKey(audio, {});
            const result = {
                transcript,
                confidence: 0.95, // High confidence for preloaded data
                language: 'en',
                processingTime: 0,
                segments: [],
            };
            await this.set(key, result, 86400); // Cache for 24 hours
        });
        await Promise.allSettled(preloadPromises);
        logger_1.logger.info('Cache preload completed');
    }
    /**
     * Clean up expired entries (manual cleanup)
     */
    async cleanup() {
        try {
            // Redis automatically handles TTL cleanup, but we can do manual cleanup if needed
            const keys = await this.redis.keys('*');
            let cleanedCount = 0;
            for (const key of keys) {
                const ttl = await this.redis.ttl(key);
                if (ttl === -1) {
                    // No TTL set
                    await this.redis.expire(key, this.defaultTTL);
                    cleanedCount++;
                }
            }
            logger_1.logger.info('Cache cleanup completed', {
                totalKeys: keys.length,
                cleanedKeys: cleanedCount,
            });
        }
        catch (error) {
            logger_1.logger.error('Cache cleanup failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    /**
     * Close Redis connection
     */
    async close() {
        await this.redis.quit();
        logger_1.logger.info('Transcription cache connection closed');
    }
    generateAudioFingerprint(audioBuffer) {
        // Generate a more sophisticated fingerprint based on audio characteristics
        const hash = (0, crypto_1.createHash)('sha256');
        // Add buffer content
        hash.update(audioBuffer);
        // Add buffer size
        hash.update(audioBuffer.length.toString());
        // Simple audio characteristics (RMS energy in chunks)
        const chunkSize = Math.max(1, Math.floor(audioBuffer.length / 10));
        for (let i = 0; i < audioBuffer.length; i += chunkSize) {
            const chunk = audioBuffer.subarray(i, i + chunkSize);
            let rms = 0;
            // Calculate RMS for this chunk
            for (let j = 0; j < chunk.length; j += 2) {
                if (j + 1 < chunk.length) {
                    const sample = chunk.readInt16LE(j);
                    rms += sample * sample;
                }
            }
            rms = Math.sqrt(rms / (chunk.length / 2));
            hash.update(Math.floor(rms).toString());
        }
        return hash.digest('hex').substring(0, 16); // First 16 characters
    }
    recordLookupTime(time) {
        this.lookupTimes.push(time);
        // Keep only last 1000 measurements
        if (this.lookupTimes.length > 1000) {
            this.lookupTimes.shift();
        }
    }
}
exports.TranscriptionCache = TranscriptionCache;
//# sourceMappingURL=TranscriptionCache.js.map