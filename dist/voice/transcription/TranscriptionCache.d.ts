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
import { TranscriptResult, TranscriptionOptions } from '../types';
export interface CacheStats {
    hits: number;
    misses: number;
    hitRate: number;
    averageLookupTime: number;
    totalKeys: number;
    memoryUsage: number;
}
export declare class TranscriptionCache {
    private redis;
    private keyPrefix;
    private defaultTTL;
    private hits;
    private misses;
    private lookupTimes;
    constructor();
    /**
     * Generate cache key from audio buffer and options
     * Uses audio fingerprinting for consistent keys
     */
    generateCacheKey(audioBuffer: Buffer, options: TranscriptionOptions): string;
    /**
     * Get cached transcription result
     * Target: <10ms lookup time
     */
    get(key: string): Promise<TranscriptResult | null>;
    /**
     * Cache transcription result
     */
    set(key: string, result: TranscriptResult, ttl?: number): Promise<void>;
    /**
     * Delete cached result
     */
    delete(key: string): Promise<void>;
    /**
     * Clear all cached results
     */
    clear(): Promise<void>;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats;
    /**
     * Get total number of cached keys
     */
    getTotalKeys(): Promise<number>;
    /**
     * Get memory usage information
     */
    getMemoryUsage(): Promise<number>;
    /**
     * Preload cache with common transcriptions
     */
    preload(commonPhrases: Array<{
        audio: Buffer;
        transcript: string;
    }>): Promise<void>;
    /**
     * Clean up expired entries (manual cleanup)
     */
    cleanup(): Promise<void>;
    /**
     * Close Redis connection
     */
    close(): Promise<void>;
    private generateAudioFingerprint;
    private recordLookupTime;
}
//# sourceMappingURL=TranscriptionCache.d.ts.map