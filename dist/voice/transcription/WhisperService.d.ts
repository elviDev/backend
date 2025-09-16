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
import { TranscriptResult, TranscriptionOptions, AudioSegment } from '../types';
export declare class WhisperService {
    private connectionPool;
    private cache;
    private performanceMetrics;
    private requestCount;
    constructor();
    /**
     * Transcribe audio buffer to text
     * Target: <1.5 seconds processing time
     */
    transcribeAudio(audioBuffer: Buffer, options?: TranscriptionOptions): Promise<TranscriptResult>;
    /**
     * Transcribe multiple audio segments in parallel
     * Optimized for complex multi-segment commands
     */
    transcribeBatch(audioSegments: AudioSegment[]): Promise<TranscriptResult[]>;
    /**
     * Transcribe with streaming support for real-time processing
     */
    transcribeStream(audioStream: AsyncGenerator<Buffer>): Promise<AsyncGenerator<Partial<TranscriptResult>>>;
    /**
     * Get service performance statistics
     */
    getPerformanceStats(): Record<string, {
        average: number;
        p95: number;
        p99: number;
        count: number;
    }>;
    /**
     * Get service health status
     */
    getHealthStatus(): {
        status: 'healthy' | 'degraded' | 'unhealthy';
        metrics: Record<string, any>;
        connectionPool: any;
        cache: any;
    };
    private validateAudioBuffer;
    private prepareFormData;
    private processWhisperResponse;
    private recordPerformanceMetric;
}
//# sourceMappingURL=WhisperService.d.ts.map