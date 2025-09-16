"use strict";
/**
 * Whisper Transcription Service - Phase 2 Voice Processing
 * OpenAI Whisper API integration with connection pooling and caching
 *
 * Success Criteria:
 * - Single audio transcription in <1.5 seconds
 * - Batch processing for multiple segments
 * - Error handling with automatic retry
 * - 95%+ transcription accuracy for clear speech
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhisperService = void 0;
const form_data_1 = __importDefault(require("form-data"));
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../../utils/logger");
const types_1 = require("../types");
const WhisperConnectionPool_1 = require("./WhisperConnectionPool");
const TranscriptionCache_1 = require("./TranscriptionCache");
class WhisperService {
    connectionPool;
    cache;
    performanceMetrics = new Map();
    requestCount = 0;
    constructor() {
        this.connectionPool = new WhisperConnectionPool_1.WhisperConnectionPool(5);
        this.cache = new TranscriptionCache_1.TranscriptionCache();
        logger_1.logger.info('Whisper service initialized', {
            poolSize: 5,
            cacheEnabled: true,
        });
    }
    /**
     * Transcribe audio buffer to text
     * Target: <1.5 seconds processing time
     */
    async transcribeAudio(audioBuffer, options = {}) {
        const startTime = perf_hooks_1.performance.now();
        const requestId = `whisper-${++this.requestCount}-${Date.now()}`;
        try {
            // Validate input
            this.validateAudioBuffer(audioBuffer);
            // Check cache first
            const cacheKey = this.cache.generateCacheKey(audioBuffer, options);
            const cachedResult = await this.cache.get(cacheKey);
            if (cachedResult) {
                logger_1.logger.debug('Whisper cache hit', { requestId, cacheKey });
                return {
                    ...cachedResult,
                    processingTime: perf_hooks_1.performance.now() - startTime,
                };
            }
            // Get connection from pool
            const connection = await this.connectionPool.getConnection();
            try {
                // Prepare form data
                const formData = this.prepareFormData(audioBuffer, options);
                // Make API request
                const response = await connection.post('/audio/transcriptions', formData, {
                    headers: formData.getHeaders(),
                    timeout: 15000, // 15 second timeout
                    maxContentLength: 25 * 1024 * 1024, // 25MB max
                });
                const processingTime = perf_hooks_1.performance.now() - startTime;
                // Process response
                const result = this.processWhisperResponse(response.data, processingTime, requestId);
                // Cache successful results
                if (result.confidence > 0.7) {
                    await this.cache.set(cacheKey, result, 3600); // Cache for 1 hour
                }
                // Record metrics
                this.recordPerformanceMetric('transcription_time', processingTime);
                this.recordPerformanceMetric('transcription_success', 1);
                logger_1.logger.info('Whisper transcription successful', {
                    requestId,
                    processingTime: `${processingTime.toFixed(2)}ms`,
                    transcriptLength: result.transcript.length,
                    confidence: result.confidence,
                    language: result.language,
                });
                return result;
            }
            finally {
                // Always release connection back to pool
                this.connectionPool.releaseConnection(connection);
            }
        }
        catch (error) {
            const processingTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformanceMetric('transcription_time', processingTime);
            this.recordPerformanceMetric('transcription_error', 1);
            logger_1.logger.error('Whisper transcription failed', {
                requestId,
                error: error instanceof Error ? error.message : String(error),
                processingTime: `${processingTime.toFixed(2)}ms`,
                audioSize: audioBuffer.length,
                options,
            });
            throw new types_1.VoiceProcessingError('Transcription failed', {
                requestId,
                processingTime,
                originalError: error instanceof Error ? error.message : String(error),
                audioSize: audioBuffer.length,
            });
        }
    }
    /**
     * Transcribe multiple audio segments in parallel
     * Optimized for complex multi-segment commands
     */
    async transcribeBatch(audioSegments) {
        if (audioSegments.length === 0) {
            return [];
        }
        const startTime = perf_hooks_1.performance.now();
        const batchId = `batch-${Date.now()}`;
        logger_1.logger.info('Starting batch transcription', {
            batchId,
            segmentCount: audioSegments.length,
        });
        try {
            // Process segments in parallel (max 3 concurrent to avoid rate limiting)
            const concurrencyLimit = 3;
            const results = [];
            for (let i = 0; i < audioSegments.length; i += concurrencyLimit) {
                const batch = audioSegments.slice(i, i + concurrencyLimit);
                const batchPromises = batch.map((segment, index) => this.transcribeAudio(segment.audioData, {
                    language: segment.language ?? '',
                    prompt: segment.context ?? '',
                }).catch((error) => ({
                    transcript: '',
                    confidence: 0,
                    language: 'unknown',
                    processingTime: 0,
                    error: error instanceof Error ? error.message : String(error),
                })));
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
                // Small delay between batches to respect rate limits
                if (i + concurrencyLimit < audioSegments.length) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }
            const totalTime = perf_hooks_1.performance.now() - startTime;
            const successfulResults = results.filter((r) => !r.error);
            logger_1.logger.info('Batch transcription completed', {
                batchId,
                totalTime: `${totalTime.toFixed(2)}ms`,
                totalSegments: audioSegments.length,
                successfulTranscriptions: successfulResults.length,
                failedTranscriptions: results.length - successfulResults.length,
            });
            return results;
        }
        catch (error) {
            const totalTime = perf_hooks_1.performance.now() - startTime;
            logger_1.logger.error('Batch transcription failed', {
                batchId,
                error: error instanceof Error ? error.message : String(error),
                totalTime: `${totalTime.toFixed(2)}ms`,
                segmentCount: audioSegments.length,
            });
            throw new types_1.VoiceProcessingError('Batch transcription failed', {
                batchId,
                totalTime,
                segmentCount: audioSegments.length,
                originalError: error instanceof Error ? error.message : String(error),
            });
        }
    }
    /**
     * Transcribe with streaming support for real-time processing
     */
    async transcribeStream(audioStream) {
        const streamId = `stream-${Date.now()}`;
        logger_1.logger.info('Starting stream transcription', { streamId });
        return async function* () {
            const bufferChunks = [];
            let segmentBuffer = Buffer.alloc(0);
            try {
                for await (const chunk of audioStream) {
                    segmentBuffer = Buffer.concat([segmentBuffer, chunk]);
                    // Process when we have enough data (2 seconds of audio)
                    const minSize = 16000 * 2 * 2; // 2 seconds at 16kHz, 16-bit
                    if (segmentBuffer.length >= minSize) {
                        try {
                            const result = await this.transcribeAudio(segmentBuffer);
                            yield {
                                transcript: result.transcript,
                                confidence: result.confidence,
                                language: result.language,
                                processingTime: result.processingTime,
                            };
                            // Reset buffer
                            segmentBuffer = Buffer.alloc(0);
                        }
                        catch (error) {
                            yield {
                                error: error instanceof Error ? error.message : String(error),
                                processingTime: 0,
                            };
                        }
                    }
                }
                // Process remaining buffer
                if (segmentBuffer.length > 0) {
                    try {
                        const result = await this.transcribeAudio(segmentBuffer);
                        yield result;
                    }
                    catch (error) {
                        yield {
                            error: error instanceof Error ? error.message : String(error),
                            processingTime: 0,
                        };
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Stream transcription error', {
                    streamId,
                    error: error instanceof Error ? error.message : String(error),
                });
                yield {
                    error: error instanceof Error ? error.message : String(error),
                    processingTime: 0,
                };
            }
        }.call(this);
    }
    /**
     * Get service performance statistics
     */
    getPerformanceStats() {
        const stats = {};
        for (const [metric, values] of this.performanceMetrics.entries()) {
            if (values.length === 0)
                continue;
            const sorted = [...values].sort((a, b) => a - b);
            const average = values.reduce((sum, val) => sum + val, 0) / values.length;
            const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
            const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
            stats[metric] = {
                average: Math.round(average * 100) / 100,
                p95: Math.round(p95 * 100) / 100,
                p99: Math.round(p99 * 100) / 100,
                count: values.length,
            };
        }
        return stats;
    }
    /**
     * Get service health status
     */
    getHealthStatus() {
        const stats = this.getPerformanceStats();
        const poolStats = this.connectionPool.getStats();
        const cacheStats = this.cache.getStats();
        let status = 'healthy';
        // Check if average transcription time is too high
        const avgTime = stats.transcription_time?.average || 0;
        if (avgTime > 3000) {
            status = 'unhealthy';
        }
        else if (avgTime > 2000) {
            status = 'degraded';
        }
        // Check error rate
        const successCount = stats.transcription_success?.count || 0;
        const errorCount = stats.transcription_error?.count || 0;
        const errorRate = errorCount / (successCount + errorCount) || 0;
        if (errorRate > 0.1) {
            status = 'unhealthy';
        }
        else if (errorRate > 0.05) {
            status = 'degraded';
        }
        return {
            status,
            metrics: stats,
            connectionPool: poolStats,
            cache: cacheStats,
        };
    }
    validateAudioBuffer(buffer) {
        if (!buffer || buffer.length === 0) {
            throw new Error('Audio buffer is empty');
        }
        if (buffer.length > 25 * 1024 * 1024) {
            // 25MB limit
            throw new Error('Audio buffer too large (>25MB)');
        }
        if (buffer.length < 1000) {
            // Minimum reasonable size
            throw new Error('Audio buffer too small (<1KB)');
        }
    }
    prepareFormData(audioBuffer, options) {
        const formData = new form_data_1.default();
        // Add audio file
        formData.append('file', audioBuffer, {
            filename: 'audio.wav',
            contentType: 'audio/wav',
        });
        // Add model
        formData.append('model', 'whisper-1');
        // Add response format
        formData.append('response_format', options.responseFormat || 'verbose_json');
        // Add optional parameters
        if (options.language) {
            formData.append('language', options.language);
        }
        if (options.prompt) {
            formData.append('prompt', options.prompt);
        }
        if (options.temperature !== undefined) {
            formData.append('temperature', options.temperature.toString());
        }
        return formData;
    }
    processWhisperResponse(responseData, processingTime, requestId) {
        const transcript = responseData.text || '';
        const language = responseData.language || 'en';
        // Calculate confidence score from segments if available
        let confidence = 0.9; // Default confidence
        if (responseData.segments && responseData.segments.length > 0) {
            const totalConfidence = responseData.segments.reduce((sum, segment) => sum + (segment.confidence || 0.9), 0);
            confidence = Math.max(0.1, Math.min(1.0, totalConfidence / responseData.segments.length));
        }
        // Validate transcript quality
        if (transcript.length === 0) {
            confidence = 0;
        }
        else if (transcript.length < 3) {
            confidence *= 0.5; // Reduce confidence for very short transcripts
        }
        logger_1.logger.debug('Whisper response processed', {
            requestId,
            transcriptLength: transcript.length,
            confidence,
            language,
            segmentCount: responseData.segments?.length || 0,
        });
        return {
            transcript,
            confidence,
            language,
            processingTime,
            segments: responseData.segments || [],
        };
    }
    recordPerformanceMetric(key, value) {
        if (!this.performanceMetrics.has(key)) {
            this.performanceMetrics.set(key, []);
        }
        const metrics = this.performanceMetrics.get(key);
        metrics.push(value);
        // Keep only last 1000 measurements
        if (metrics.length > 1000) {
            metrics.shift();
        }
    }
}
exports.WhisperService = WhisperService;
//# sourceMappingURL=WhisperService.js.map