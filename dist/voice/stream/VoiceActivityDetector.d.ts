/**
 * Voice Activity Detector (VAD) - Phase 2 Voice Processing
 * Real-time speech detection with background noise adaptation
 *
 * Success Criteria:
 * - 95%+ accuracy in detecting speech vs silence
 * - <10ms processing time per chunk
 * - Adjustable sensitivity thresholds
 * - Handles background noise effectively
 */
export interface VADConfig {
    threshold: number;
    sensitivity: number;
    smoothing: number;
    minSpeechDuration: number;
    hangoverTime: number;
}
export interface VADResult {
    hasVoice: boolean;
    confidence: number;
    energy: number;
    backgroundNoise: number;
    processingTime: number;
}
export declare class VoiceActivityDetector {
    private config;
    private energyHistory;
    private backgroundNoise;
    private speechStart;
    private lastSpeechTime;
    private isInSpeech;
    private adaptiveThreshold;
    private performanceMetrics;
    private spectralCentroid;
    private zeroCrossingRate;
    private energyVariance;
    constructor(config?: Partial<VADConfig>);
    /**
     * Detect voice activity in audio chunk
     * Target: <10ms processing time
     */
    detectActivity(audioChunk: Buffer): Promise<boolean>;
    /**
     * Get detailed VAD result with confidence and metrics
     */
    detectActivityDetailed(audioChunk: Buffer): Promise<VADResult>;
    /**
     * Calibrate detector based on background noise sample
     */
    calibrateThreshold(backgroundSample: Buffer): void;
    /**
     * Get confidence score for current audio chunk
     */
    getConfidenceScore(audioChunk: Buffer): number;
    /**
     * Update sensitivity settings
     */
    updateSensitivity(sensitivity: number): void;
    /**
     * Get current performance statistics
     */
    getPerformanceStats(): {
        average: number;
        p95: number;
        p99: number;
        count: number;
    };
    /**
     * Reset VAD state
     */
    reset(): void;
    private analyzeAudio;
    private makeDecision;
    private bufferToSamples;
    private calculateRMSEnergy;
    private calculateSpectralCentroid;
    private calculateZeroCrossingRate;
    private updateEnergyHistory;
    private calculateConfidence;
    private updateBackgroundNoise;
    private calculateDynamicThreshold;
    private makeSpectralDecision;
    private recordPerformance;
}
//# sourceMappingURL=VoiceActivityDetector.d.ts.map