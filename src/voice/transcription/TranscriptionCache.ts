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

import { createHash } from 'crypto';
import { performance } from 'perf_hooks';
import Redis from 'ioredis';
import { logger } from '../../utils/logger';
import { TranscriptResult, TranscriptionOptions } from '../types';

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  averageLookupTime: number;
  totalKeys: number;
  memoryUsage: number;
}

export class TranscriptionCache {
  private redis: Redis;
  private keyPrefix = 'whisper:cache:';
  private defaultTTL = 3600; // 1 hour

  // Statistics
  private hits = 0;
  private misses = 0;
  private lookupTimes: number[] = [];

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_CACHE_DB || '1'), // Use separate DB for cache
      keyPrefix: this.keyPrefix,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableReadyCheck: true,
    });

    this.redis.on('connect', () => {
      logger.info('Transcription cache connected to Redis');
    });

    this.redis.on('error', (error) => {
      logger.error('Transcription cache Redis error', { error: error.message });
    });

    logger.debug('Transcription cache initialized');
  }

  /**
   * Generate cache key from audio buffer and options
   * Uses audio fingerprinting for consistent keys
   */
  generateCacheKey(audioBuffer: Buffer, options: TranscriptionOptions): string {
    // Create hash of audio content
    const audioHash = this.generateAudioFingerprint(audioBuffer);

    // Include relevant options in key
    const optionsKey = JSON.stringify({
      language: options.language || 'auto',
      temperature: options.temperature || 0,
      responseFormat: options.responseFormat || 'verbose_json',
    });

    const optionsHash = createHash('md5').update(optionsKey).digest('hex').substring(0, 8);

    return `${audioHash}:${optionsHash}`;
  }

  /**
   * Get cached transcription result
   * Target: <10ms lookup time
   */
  async get(key: string): Promise<TranscriptResult | null> {
    const startTime = performance.now();

    try {
      const cached = await this.redis.get(key);
      const lookupTime = performance.now() - startTime;

      this.recordLookupTime(lookupTime);

      if (cached) {
        this.hits++;

        // Extend TTL on cache hit
        await this.redis.expire(key, this.defaultTTL);

        const result = JSON.parse(cached) as TranscriptResult;

        logger.debug('Cache hit', {
          key,
          lookupTime: `${lookupTime.toFixed(2)}ms`,
          transcriptLength: result.transcript.length,
        });

        return result;
      } else {
        this.misses++;

        logger.debug('Cache miss', {
          key,
          lookupTime: `${lookupTime.toFixed(2)}ms`,
        });

        return null;
      }
    } catch (error) {
      const lookupTime = performance.now() - startTime;
      this.misses++;
      this.recordLookupTime(lookupTime);

      logger.error('Cache lookup failed', {
        key,
        error: (error as Error).message,
        lookupTime: `${lookupTime.toFixed(2)}ms`,
      });

      return null;
    }
  }

  /**
   * Cache transcription result
   */
  async set(key: string, result: TranscriptResult, ttl?: number): Promise<void> {
    try {
      const cacheData = {
        ...result,
        cachedAt: new Date().toISOString(),
        // Remove processingTime from cache (will be recalculated)
        processingTime: undefined,
      };

      await this.redis.setex(key, ttl || this.defaultTTL, JSON.stringify(cacheData));

      logger.debug('Result cached', {
        key,
        ttl: ttl || this.defaultTTL,
        transcriptLength: result.transcript.length,
        confidence: result.confidence,
      });
    } catch (error) {
      logger.error('Cache set failed', {
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Delete cached result
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      logger.debug('Cache entry deleted', { key });
    } catch (error) {
      logger.error('Cache delete failed', {
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Clear all cached results
   */
  async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys('*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info('Cache cleared', { deletedKeys: keys.length });
      }
    } catch (error) {
      logger.error('Cache clear failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

    const avgLookupTime =
      this.lookupTimes.length > 0
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
  async getTotalKeys(): Promise<number> {
    try {
      const keys = await this.redis.keys('*');
      return keys.length;
    } catch (error) {
      logger.error('Failed to get total keys', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Get memory usage information
   */
  async getMemoryUsage(): Promise<number> {
    try {
      const info = await this.redis.memory('USAGE', this.keyPrefix + '*');
      return info || 0;
    } catch (error) {
      logger.error('Failed to get memory usage', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Preload cache with common transcriptions
   */
  async preload(commonPhrases: Array<{ audio: Buffer; transcript: string }>): Promise<void> {
    logger.info('Starting cache preload', { phrasesCount: commonPhrases.length });

    const preloadPromises = commonPhrases.map(async ({ audio, transcript }) => {
      const key = this.generateCacheKey(audio, {});
      const result: TranscriptResult = {
        transcript,
        confidence: 0.95, // High confidence for preloaded data
        language: 'en',
        processingTime: 0,
        segments: [],
      };

      await this.set(key, result, 86400); // Cache for 24 hours
    });

    await Promise.allSettled(preloadPromises);
    logger.info('Cache preload completed');
  }

  /**
   * Clean up expired entries (manual cleanup)
   */
  async cleanup(): Promise<void> {
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

      logger.info('Cache cleanup completed', {
        totalKeys: keys.length,
        cleanedKeys: cleanedCount,
      });
    } catch (error) {
      logger.error('Cache cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    logger.info('Transcription cache connection closed');
  }

  private generateAudioFingerprint(audioBuffer: Buffer): string {
    // Generate a more sophisticated fingerprint based on audio characteristics
    const hash = createHash('sha256');

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

  private recordLookupTime(time: number): void {
    this.lookupTimes.push(time);

    // Keep only last 1000 measurements
    if (this.lookupTimes.length > 1000) {
      this.lookupTimes.shift();
    }
  }
}
