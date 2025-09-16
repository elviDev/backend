"use strict";
/**
 * Audio Stream Manager - Phase 2 Voice Processing Pipeline
 * Handles WebRTC audio streaming with real-time processing
 *
 * Success Criteria:
 * - WebRTC connection established with <100ms latency
 * - Audio stream supports 16kHz, mono, PCM16 format
 * - Stream handles 1KB chunks efficiently
 * - Memory usage <50MB for 10 concurrent streams
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioStream = exports.AudioStreamManager = void 0;
const events_1 = require("events");
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../../utils/logger");
const VoiceActivityDetector_1 = require("./VoiceActivityDetector");
const AudioPreprocessor_1 = require("./AudioPreprocessor");
const CircularBuffer_1 = require("./CircularBuffer");
class AudioStreamManager extends events_1.EventEmitter {
    activeStreams = new Map();
    vad;
    preprocessor;
    performanceMetrics = new Map();
    constructor() {
        super();
        this.vad = new VoiceActivityDetector_1.VoiceActivityDetector({
            threshold: 0.5,
            sensitivity: 0.8,
            smoothing: 0.3,
        });
        this.preprocessor = new AudioPreprocessor_1.AudioPreprocessor();
        // Setup periodic cleanup
        setInterval(() => this.cleanupInactiveStreams(), 30000); // Every 30 seconds
    }
    /**
     * Initialize a new audio stream
     * Target: <100ms initialization time
     */
    async initializeStream(config) {
        const startTime = perf_hooks_1.performance.now();
        try {
            // Validate configuration
            this.validateStreamConfig(config);
            // Check memory constraints (max 10 concurrent streams)
            if (this.activeStreams.size >= 10) {
                throw new Error('Maximum concurrent streams (10) reached');
            }
            // Create new audio stream
            const stream = new AudioStream(config, this.vad, this.preprocessor);
            await stream.initialize();
            // Store stream
            this.activeStreams.set(config.socketId, stream);
            // Setup stream event handlers
            this.setupStreamEventHandlers(stream);
            const initTime = perf_hooks_1.performance.now() - startTime;
            // Record performance metrics
            this.recordMetric('stream_init_time', initTime);
            logger_1.logger.info('Audio stream initialized', {
                socketId: config.socketId,
                userId: config.userId,
                initTime: `${initTime.toFixed(2)}ms`,
                activeStreams: this.activeStreams.size,
            });
            // Emit stream ready event
            this.emit('stream_initialized', {
                socketId: config.socketId,
                userId: config.userId,
                config,
                initTime,
            });
            return stream;
        }
        catch (error) {
            const initTime = perf_hooks_1.performance.now() - startTime;
            logger_1.logger.error('Audio stream initialization failed', {
                socketId: config.socketId,
                error: error instanceof Error ? error.message : String(error),
                initTime: `${initTime.toFixed(2)}ms`,
            });
            throw error;
        }
    }
    /**
     * Process audio chunk for a specific stream
     * Target: <10ms processing time per chunk
     */
    async processAudioChunk(socketId, audioChunk) {
        const startTime = perf_hooks_1.performance.now();
        try {
            const stream = this.activeStreams.get(socketId);
            if (!stream) {
                throw new Error(`Audio stream not found: ${socketId}`);
            }
            // Validate chunk size and format
            if (audioChunk.length === 0) {
                return { status: 'waiting' };
            }
            // Process audio chunk through the stream
            const result = await stream.processChunk(audioChunk);
            const processingTime = perf_hooks_1.performance.now() - startTime;
            // Record performance metrics
            this.recordMetric('chunk_processing_time', processingTime);
            // Log slow processing
            if (processingTime > 10) {
                logger_1.logger.warn('Slow audio chunk processing', {
                    socketId,
                    processingTime: `${processingTime.toFixed(2)}ms`,
                    chunkSize: audioChunk.length,
                });
            }
            return {
                ...result,
                processingTime,
            };
        }
        catch (error) {
            const processingTime = perf_hooks_1.performance.now() - startTime;
            logger_1.logger.error('Audio chunk processing failed', {
                socketId,
                error: error instanceof Error ? error.message : String(error),
                processingTime: `${processingTime.toFixed(2)}ms`,
                chunkSize: audioChunk.length,
            });
            return {
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
                processingTime,
            };
        }
    }
    /**
     * Close audio stream and cleanup resources
     */
    async closeStream(socketId) {
        const stream = this.activeStreams.get(socketId);
        if (!stream) {
            return;
        }
        try {
            await stream.close();
            this.activeStreams.delete(socketId);
            logger_1.logger.info('Audio stream closed', {
                socketId,
                remainingStreams: this.activeStreams.size,
            });
            this.emit('stream_closed', { socketId });
        }
        catch (error) {
            logger_1.logger.error('Error closing audio stream', {
                socketId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    /**
     * Get stream status information
     */
    getStreamStatus(socketId) {
        const stream = this.activeStreams.get(socketId);
        if (!stream) {
            return null;
        }
        return stream.getStatus();
    }
    /**
     * Get all active streams
     */
    getActiveStreams() {
        return Array.from(this.activeStreams.keys());
    }
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        const metrics = {};
        for (const [key, values] of this.performanceMetrics.entries()) {
            if (values.length === 0)
                continue;
            const sorted = [...values].sort((a, b) => a - b);
            const average = values.reduce((sum, val) => sum + val, 0) / values.length;
            const p95Index = Math.floor(sorted.length * 0.95);
            const p95 = sorted[p95Index] || sorted[sorted.length - 1];
            metrics[key] = {
                average: Math.round(average * 100) / 100,
                p95: Math.round((p95 ?? 0) * 100) / 100,
                count: values.length,
            };
        }
        return metrics;
    }
    /**
     * Get memory usage for all active streams
     */
    getMemoryUsage() {
        let total = 0;
        const perStream = {};
        for (const [socketId, stream] of this.activeStreams.entries()) {
            const streamMemory = stream.getMemoryUsage();
            total += streamMemory;
            perStream[socketId] = streamMemory;
        }
        return { total, perStream };
    }
    validateStreamConfig(config) {
        if (!config.userId || !config.socketId) {
            throw new Error('userId and socketId are required');
        }
        if (config.sampleRate !== 16000) {
            throw new Error('Only 16kHz sample rate is supported');
        }
        if (config.channels !== 1) {
            throw new Error('Only mono audio is supported');
        }
        if (config.format !== 'pcm16') {
            throw new Error('Only PCM16 format is supported');
        }
        if (config.chunkSize < 512 || config.chunkSize > 8192) {
            throw new Error('Chunk size must be between 512 and 8192 bytes');
        }
    }
    setupStreamEventHandlers(stream) {
        stream.on('chunk_processed', (data) => {
            this.emit('stream_progress', {
                socketId: stream.config.socketId,
                userId: stream.config.userId,
                ...data,
            });
        });
        stream.on('segment_complete', (segment) => {
            this.emit('audio_segment_ready', segment);
        });
        stream.on('error', (error) => {
            logger_1.logger.error('Audio stream error', {
                socketId: stream.config.socketId,
                error: error.message,
            });
            this.emit('stream_error', {
                socketId: stream.config.socketId,
                error,
            });
        });
    }
    cleanupInactiveStreams() {
        const now = Date.now();
        const inactiveThreshold = 5 * 60 * 1000; // 5 minutes
        for (const [socketId, stream] of this.activeStreams.entries()) {
            if (now - stream.getLastActivity() > inactiveThreshold) {
                logger_1.logger.info('Cleaning up inactive stream', { socketId });
                this.closeStream(socketId).catch((error) => {
                    logger_1.logger.error('Error during stream cleanup', { socketId, error: error.message });
                });
            }
        }
    }
    recordMetric(key, value) {
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
exports.AudioStreamManager = AudioStreamManager;
/**
 * Individual Audio Stream Handler
 */
class AudioStream extends events_1.EventEmitter {
    config;
    vad;
    preprocessor;
    buffer;
    lastVoiceTime = 0;
    lastActivity = 0;
    isInitialized = false;
    totalProcessed = 0;
    constructor(config, vad, preprocessor) {
        super();
        this.config = config;
        this.vad = vad;
        this.preprocessor = preprocessor;
        const bufferSize = config.maxBufferSize || config.sampleRate * 30; // 30 seconds default
        this.buffer = new CircularBuffer_1.CircularBuffer(bufferSize);
        this.lastActivity = Date.now();
    }
    async initialize() {
        await this.buffer.initialize();
        this.lastVoiceTime = Date.now();
        this.isInitialized = true;
        logger_1.logger.debug('Audio stream initialized', {
            socketId: this.config.socketId,
            bufferSize: this.buffer.getCapacity(),
        });
    }
    async processChunk(chunk) {
        if (!this.isInitialized) {
            throw new Error('Stream not initialized');
        }
        this.lastActivity = Date.now();
        this.totalProcessed += chunk.length;
        try {
            // Preprocess audio chunk
            const preprocessed = await this.preprocessor.process(chunk);
            // Voice activity detection
            const hasVoice = await this.vad.detectActivity(preprocessed);
            if (hasVoice) {
                this.lastVoiceTime = Date.now();
                this.buffer.write(preprocessed);
                this.emit('chunk_processed', {
                    hasVoice: true,
                    chunkSize: chunk.length,
                    bufferLevel: this.buffer.getLevel(),
                    timestamp: new Date().toISOString(),
                });
            }
            else {
                // Still add silence to buffer for context
                this.buffer.write(preprocessed);
                this.emit('chunk_processed', {
                    hasVoice: false,
                    chunkSize: chunk.length,
                    bufferLevel: this.buffer.getLevel(),
                    timestamp: new Date().toISOString(),
                });
            }
            // Check if segment is complete
            if (this.isSegmentComplete()) {
                const segment = await this.createSegment();
                this.emit('segment_complete', segment);
                return { status: 'segment_ready', segment, hasVoice };
            }
            return { status: hasVoice ? 'processing' : 'waiting', hasVoice };
        }
        catch (error) {
            this.emit('error', error);
            return {
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    async close() {
        this.isInitialized = false;
        this.buffer.clear();
        this.removeAllListeners();
    }
    getStatus() {
        return {
            isActive: this.isInitialized,
            bufferLevel: this.buffer.getLevel(),
            lastActivity: this.lastActivity,
            totalProcessed: this.totalProcessed,
            memoryUsage: this.getMemoryUsage(),
        };
    }
    getLastActivity() {
        return this.lastActivity;
    }
    getMemoryUsage() {
        return this.buffer.getMemoryUsage();
    }
    isSegmentComplete() {
        const silenceThreshold = this.config.silenceThreshold || 1500; // 1.5 seconds
        const maxSegmentLength = this.config.maxSegmentLength || 30000; // 30 seconds
        const silenceDuration = Date.now() - this.lastVoiceTime;
        const bufferDuration = this.buffer.getDurationMs();
        return ((silenceDuration > silenceThreshold && bufferDuration > 1000) ||
            bufferDuration > maxSegmentLength);
    }
    async createSegment() {
        const audioData = this.buffer.readAll();
        const duration = this.buffer.getDurationMs();
        const segment = {
            id: crypto.randomUUID(),
            audioData,
            sampleRate: this.config.sampleRate,
            channels: this.config.channels,
            format: this.config.format,
            duration,
            timestamp: new Date().toISOString(),
            userId: this.config.userId,
            socketId: this.config.socketId,
        };
        // Clear buffer for next segment
        this.buffer.clear();
        this.lastVoiceTime = Date.now();
        return segment;
    }
}
exports.AudioStream = AudioStream;
//# sourceMappingURL=AudioStreamManager.js.map