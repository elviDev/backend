/**
 * Voice Processing Service - Phase 2 Integration Layer
 * Orchestrates the complete voice processing pipeline
 *
 * Success Criteria Integration:
 * - End-to-end voice command processing <2 seconds (simple) / <5 seconds (complex)
 * - Coordinates audio stream, transcription, AI parsing, and execution
 * - Provides comprehensive error handling and performance monitoring
 */
import { EventEmitter } from 'events';
import { UserContext, ParsedCommand, VoiceProcessingMetrics } from './types';
export interface VoiceProcessingOptions {
    enableCaching?: boolean;
    maxProcessingTime?: number;
    qualityThreshold?: number;
    streamingMode?: boolean;
}
export interface VoiceProcessingResult {
    success: boolean;
    command?: ParsedCommand;
    metrics: VoiceProcessingMetrics;
    error?: string;
}
export declare class VoiceProcessingService extends EventEmitter {
    private audioStreamManager;
    private whisperService;
    private aiCommandParser;
    private multiActionExecutor;
    private performanceMetrics;
    constructor();
    /**
     * Process complete voice command from audio to parsed command
     * This is the main integration point for the voice processing pipeline
     */
    processVoiceCommand(audioBuffer: Buffer, userContext: UserContext, options?: VoiceProcessingOptions): Promise<VoiceProcessingResult>;
    /**
     * Process and execute complete voice command from audio to final result
     * This includes transcription, AI parsing, and multi-action execution
     */
    processAndExecuteVoiceCommand(audioBuffer: Buffer, userContext: UserContext, options?: VoiceProcessingOptions): Promise<{
        success: boolean;
        command?: ParsedCommand;
        executionResult?: any;
        metrics: VoiceProcessingMetrics;
        error?: string;
    }>;
    /**
     * Process streaming audio for real-time transcription
     */
    processStreamingAudio(audioStream: AsyncGenerator<Buffer>, userContext: UserContext, options?: VoiceProcessingOptions): Promise<AsyncGenerator<Partial<ParsedCommand>>>;
    /**
     * Get comprehensive service performance statistics
     */
    getPerformanceStatistics(): {
        overall: any;
        audioProcessing: any;
        transcription: any;
        aiParsing: any;
    };
    /**
     * Get service health status
     */
    getHealthStatus(): {
        status: 'healthy' | 'degraded' | 'unhealthy';
        components: Record<string, any>;
        metrics: any;
    };
    private validateAudioInput;
    private validatePerformanceTargets;
    private recordMetrics;
    private calculateOverallStats;
    private setupEventHandlers;
}
//# sourceMappingURL=VoiceProcessingService.d.ts.map