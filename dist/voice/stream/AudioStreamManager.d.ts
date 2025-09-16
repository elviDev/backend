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
import { EventEmitter } from 'events';
import { VoiceActivityDetector } from './VoiceActivityDetector';
import { AudioPreprocessor } from './AudioPreprocessor';
export interface AudioStreamConfig {
    userId: string;
    socketId: string;
    sampleRate: number;
    channels: number;
    format: 'pcm16' | 'pcm32' | 'float32';
    chunkSize: number;
    maxBufferSize?: number;
    silenceThreshold?: number;
    maxSegmentLength?: number;
}
export interface AudioSegment {
    id: string;
    audioData: Buffer;
    sampleRate: number;
    channels: number;
    format: string;
    duration: number;
    timestamp: string;
    userId: string;
    socketId: string;
}
export interface ProcessingResult {
    status: 'waiting' | 'processing' | 'segment_ready' | 'error';
    hasVoice?: boolean;
    segment?: AudioSegment;
    processingTime?: number;
    error?: string;
}
export interface StreamStatus {
    isActive: boolean;
    bufferLevel: number;
    lastActivity: number;
    totalProcessed: number;
    memoryUsage: number;
}
export declare class AudioStreamManager extends EventEmitter {
    private activeStreams;
    private vad;
    private preprocessor;
    private performanceMetrics;
    constructor();
    /**
     * Initialize a new audio stream
     * Target: <100ms initialization time
     */
    initializeStream(config: AudioStreamConfig): Promise<AudioStream>;
    /**
     * Process audio chunk for a specific stream
     * Target: <10ms processing time per chunk
     */
    processAudioChunk(socketId: string, audioChunk: Buffer): Promise<ProcessingResult>;
    /**
     * Close audio stream and cleanup resources
     */
    closeStream(socketId: string): Promise<void>;
    /**
     * Get stream status information
     */
    getStreamStatus(socketId: string): StreamStatus | null;
    /**
     * Get all active streams
     */
    getActiveStreams(): string[];
    /**
     * Get performance metrics
     */
    getPerformanceMetrics(): Record<string, {
        average: number;
        p95: number;
        count: number;
    }>;
    /**
     * Get memory usage for all active streams
     */
    getMemoryUsage(): {
        total: number;
        perStream: Record<string, number>;
    };
    private validateStreamConfig;
    private setupStreamEventHandlers;
    private cleanupInactiveStreams;
    private recordMetric;
}
/**
 * Individual Audio Stream Handler
 */
export declare class AudioStream extends EventEmitter {
    config: AudioStreamConfig;
    private vad;
    private preprocessor;
    private buffer;
    private lastVoiceTime;
    private lastActivity;
    private isInitialized;
    private totalProcessed;
    constructor(config: AudioStreamConfig, vad: VoiceActivityDetector, preprocessor: AudioPreprocessor);
    initialize(): Promise<void>;
    processChunk(chunk: Buffer): Promise<ProcessingResult>;
    close(): Promise<void>;
    getStatus(): StreamStatus;
    getLastActivity(): number;
    getMemoryUsage(): number;
    private isSegmentComplete;
    private createSegment;
}
//# sourceMappingURL=AudioStreamManager.d.ts.map