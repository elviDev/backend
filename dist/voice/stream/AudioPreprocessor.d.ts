/**
 * Audio Preprocessor - Phase 2 Voice Processing Pipeline
 * Real-time audio enhancement and noise reduction
 *
 * Success Criteria:
 * - Noise reduction improves transcription accuracy by 15%+
 * - Volume normalization prevents clipping
 * - Processing adds <50ms latency
 * - Output optimized for Whisper API format
 */
export interface PreprocessorConfig {
    noiseReduction: boolean;
    volumeNormalization: boolean;
    highPassFilter: boolean;
    lowPassFilter: boolean;
    agcEnabled: boolean;
    targetRMS: number;
    noiseGateThreshold: number;
    highPassFreq: number;
    lowPassFreq: number;
    sampleRate: number;
}
export interface ProcessingResult {
    processedAudio: Buffer;
    processingTime: number;
    applied: string[];
    metrics: {
        inputRMS: number;
        outputRMS: number;
        noiseReduction: number;
        clippingPrevented: boolean;
    };
}
export declare class AudioPreprocessor {
    private config;
    private performanceMetrics;
    private runningRMS;
    private noiseProfile;
    private agcGain;
    private dcOffset;
    private highPassState;
    private lowPassState;
    constructor(config?: Partial<PreprocessorConfig>);
    /**
     * Process audio buffer with all enabled preprocessing steps
     * Target: <50ms processing time
     */
    process(audioBuffer: Buffer): Promise<Buffer>;
    /**
     * Process with detailed results
     */
    processDetailed(audioBuffer: Buffer): Promise<ProcessingResult>;
    /**
     * Update noise profile for noise reduction
     */
    updateNoiseProfile(noiseSample: Buffer): void;
    /**
     * Get performance statistics
     */
    getPerformanceStats(): {
        average: number;
        p95: number;
        p99: number;
        count: number;
    };
    private bufferToFloat32;
    private float32ToBuffer;
    private calculateRMS;
    private removeDCOffset;
    private applyHighPassFilter;
    private applyLowPassFilter;
    private applyNoiseGate;
    private applyNoiseReduction;
    private applyAutomaticGainControl;
    private normalizeVolume;
    private checkForClipping;
    private recordPerformance;
}
//# sourceMappingURL=AudioPreprocessor.d.ts.map