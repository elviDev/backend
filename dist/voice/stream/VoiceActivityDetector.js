"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceActivityDetector = void 0;
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../../utils/logger");
class VoiceActivityDetector {
    config;
    energyHistory = [];
    backgroundNoise = 0;
    speechStart = 0;
    lastSpeechTime = 0;
    isInSpeech = false;
    adaptiveThreshold = 0;
    performanceMetrics = [];
    // Advanced features
    spectralCentroid = 0;
    zeroCrossingRate = 0;
    energyVariance = 0;
    constructor(config = {}) {
        this.config = {
            threshold: 0.02, // Base threshold
            sensitivity: 0.8, // High sensitivity
            smoothing: 0.95, // Slow adaptation to background noise
            minSpeechDuration: 100, // 100ms minimum speech
            hangoverTime: 200, // 200ms hangover
            ...config,
        };
        this.adaptiveThreshold = this.config.threshold;
        logger_1.logger.debug('VAD initialized', { config: this.config });
    }
    /**
     * Detect voice activity in audio chunk
     * Target: <10ms processing time
     */
    async detectActivity(audioChunk) {
        const startTime = perf_hooks_1.performance.now();
        try {
            const result = this.analyzeAudio(audioChunk);
            const processingTime = perf_hooks_1.performance.now() - startTime;
            // Record performance
            this.recordPerformance(processingTime);
            // Log if processing is slow
            if (processingTime > 10) {
                logger_1.logger.warn('Slow VAD processing detected', {
                    processingTime: `${processingTime.toFixed(2)}ms`,
                    chunkSize: audioChunk.length,
                });
            }
            return this.makeDecision(result, processingTime);
        }
        catch (error) {
            const processingTime = perf_hooks_1.performance.now() - startTime;
            logger_1.logger.error('VAD processing error', {
                error: error instanceof Error ? error.message : String(error),
                processingTime: `${processingTime.toFixed(2)}ms`,
                chunkSize: audioChunk.length,
            });
            return false; // Default to no voice on error
        }
    }
    /**
     * Get detailed VAD result with confidence and metrics
     */
    async detectActivityDetailed(audioChunk) {
        const startTime = perf_hooks_1.performance.now();
        const result = this.analyzeAudio(audioChunk);
        const hasVoice = this.makeDecision(result, 0);
        const processingTime = perf_hooks_1.performance.now() - startTime;
        this.recordPerformance(processingTime);
        return {
            hasVoice,
            confidence: result.confidence,
            energy: result.energy,
            backgroundNoise: this.backgroundNoise,
            processingTime,
        };
    }
    /**
     * Calibrate detector based on background noise sample
     */
    calibrateThreshold(backgroundSample) {
        logger_1.logger.info('Starting VAD calibration');
        const analysis = this.analyzeAudio(backgroundSample);
        // Set background noise level
        this.backgroundNoise = analysis.energy;
        // Calculate adaptive threshold
        this.adaptiveThreshold = Math.max(this.config.threshold, this.backgroundNoise * 2.0 // Threshold should be 2x background noise
        );
        logger_1.logger.info('VAD calibration complete', {
            backgroundNoise: this.backgroundNoise.toFixed(4),
            adaptiveThreshold: this.adaptiveThreshold.toFixed(4),
            sampleSize: backgroundSample.length,
        });
    }
    /**
     * Get confidence score for current audio chunk
     */
    getConfidenceScore(audioChunk) {
        const analysis = this.analyzeAudio(audioChunk);
        return analysis.confidence;
    }
    /**
     * Update sensitivity settings
     */
    updateSensitivity(sensitivity) {
        if (sensitivity < 0 || sensitivity > 1) {
            throw new Error('Sensitivity must be between 0 and 1');
        }
        this.config.sensitivity = sensitivity;
        logger_1.logger.debug('VAD sensitivity updated', { sensitivity });
    }
    /**
     * Get current performance statistics
     */
    getPerformanceStats() {
        if (this.performanceMetrics.length === 0) {
            return { average: 0, p95: 0, p99: 0, count: 0 };
        }
        const sorted = [...this.performanceMetrics].sort((a, b) => a - b);
        const average = this.performanceMetrics.reduce((sum, time) => sum + time, 0) / this.performanceMetrics.length;
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
        const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
        return {
            average: Math.round(average * 100) / 100,
            p95: Math.round(p95 * 100) / 100,
            p99: Math.round(p99 * 100) / 100,
            count: this.performanceMetrics.length,
        };
    }
    /**
     * Reset VAD state
     */
    reset() {
        this.energyHistory = [];
        this.backgroundNoise = 0;
        this.speechStart = 0;
        this.lastSpeechTime = 0;
        this.isInSpeech = false;
        this.adaptiveThreshold = this.config.threshold;
        this.spectralCentroid = 0;
        this.zeroCrossingRate = 0;
        this.energyVariance = 0;
        logger_1.logger.debug('VAD state reset');
    }
    analyzeAudio(audioChunk) {
        // Convert buffer to samples
        const samples = this.bufferToSamples(audioChunk);
        // Calculate RMS energy
        const energy = this.calculateRMSEnergy(samples);
        // Calculate spectral features
        const spectralCentroid = this.calculateSpectralCentroid(samples);
        const zeroCrossingRate = this.calculateZeroCrossingRate(samples);
        // Update energy history for variance calculation
        this.updateEnergyHistory(energy);
        // Calculate confidence based on multiple features
        const confidence = this.calculateConfidence(energy, spectralCentroid, zeroCrossingRate);
        return {
            energy,
            confidence,
            spectralCentroid,
            zeroCrossingRate,
        };
    }
    makeDecision(analysis, processingTime) {
        const now = Date.now();
        // Update background noise (slow adaptation)
        this.updateBackgroundNoise(analysis.energy);
        // Calculate dynamic threshold
        const dynamicThreshold = this.calculateDynamicThreshold();
        // Primary decision based on energy
        const energyDecision = analysis.energy > dynamicThreshold;
        // Enhanced decision with spectral features
        const spectralDecision = this.makeSpectralDecision(analysis);
        // Combine decisions
        let hasVoice = energyDecision && spectralDecision;
        // Apply temporal logic
        if (hasVoice) {
            if (!this.isInSpeech) {
                // Start of potential speech
                this.speechStart = now;
            }
            this.lastSpeechTime = now;
            this.isInSpeech = true;
        }
        else {
            // Check hangover time
            if (this.isInSpeech && now - this.lastSpeechTime < this.config.hangoverTime) {
                hasVoice = true; // Continue detection during hangover period
            }
            else {
                // Check minimum speech duration
                if (this.isInSpeech && now - this.speechStart < this.config.minSpeechDuration) {
                    hasVoice = false; // Too short to be speech
                }
                this.isInSpeech = false;
            }
        }
        return hasVoice;
    }
    bufferToSamples(buffer) {
        const samples = new Float32Array(buffer.length / 2);
        for (let i = 0; i < samples.length; i++) {
            // Convert 16-bit PCM to float32 (-1 to 1)
            samples[i] = buffer.readInt16LE(i * 2) / 32768.0;
        }
        return samples;
    }
    calculateRMSEnergy(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            if (typeof samples[i] !== 'undefined') {
                sum += samples[i] * samples[i];
            }
        }
        return Math.sqrt(sum / samples.length);
    }
    calculateSpectralCentroid(samples) {
        // Simple approximation of spectral centroid
        let weightedSum = 0;
        let magnitudeSum = 0;
        for (let i = 1; i < samples.length; i++) {
            const magnitude = Math.abs(samples[i]);
            weightedSum += i * magnitude;
            magnitudeSum += magnitude;
        }
        return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
    }
    calculateZeroCrossingRate(samples) {
        let crossings = 0;
        for (let i = 1; i < samples.length; i++) {
            if (samples[i] >= 0 !== samples[i - 1] >= 0) {
                crossings++;
            }
        }
        return crossings / (samples.length - 1);
    }
    updateEnergyHistory(energy) {
        this.energyHistory.push(energy);
        // Keep only recent history (last 100 frames ~= 2 seconds at 50fps)
        if (this.energyHistory.length > 100) {
            this.energyHistory.shift();
        }
        // Calculate energy variance
        if (this.energyHistory.length > 10) {
            const mean = this.energyHistory.reduce((sum, e) => sum + e, 0) / this.energyHistory.length;
            const variance = this.energyHistory.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) /
                this.energyHistory.length;
            this.energyVariance = variance;
        }
    }
    calculateConfidence(energy, spectralCentroid, zeroCrossingRate) {
        // Base confidence from energy ratio
        const energyRatio = this.backgroundNoise > 0 ? energy / this.backgroundNoise : energy / this.adaptiveThreshold;
        let confidence = Math.min(1.0, energyRatio / 3.0); // Normalize to 0-1
        // Adjust based on spectral features
        if (spectralCentroid > 0.1 && zeroCrossingRate > 0.05) {
            confidence *= 1.2; // Boost confidence for speech-like spectral characteristics
        }
        if (zeroCrossingRate > 0.3) {
            confidence *= 0.8; // Reduce confidence for very high ZCR (likely noise)
        }
        return Math.max(0, Math.min(1, confidence));
    }
    updateBackgroundNoise(energy) {
        if (this.backgroundNoise === 0) {
            this.backgroundNoise = energy;
        }
        else {
            // Slow adaptation using exponential moving average
            this.backgroundNoise =
                this.config.smoothing * this.backgroundNoise + (1 - this.config.smoothing) * energy;
        }
    }
    calculateDynamicThreshold() {
        // Base threshold adjusted by sensitivity
        let threshold = this.adaptiveThreshold * (2.0 - this.config.sensitivity);
        // Adjust based on background noise
        if (this.backgroundNoise > 0) {
            threshold = Math.max(threshold, this.backgroundNoise * 1.5);
        }
        // Adjust based on energy variance (more variable = lower threshold)
        if (this.energyVariance > 0.001) {
            threshold *= 0.9;
        }
        return threshold;
    }
    makeSpectralDecision(analysis) {
        // Speech typically has:
        // - Moderate spectral centroid (not too high, not too low)
        // - Moderate zero crossing rate (not too high like noise, not too low like tones)
        const { spectralCentroid, zeroCrossingRate } = analysis;
        // Spectral centroid check (speech is usually in middle frequencies)
        const spectralOk = spectralCentroid > 0.05 && spectralCentroid < 0.5;
        // Zero crossing rate check (speech has moderate ZCR)
        const zcrOk = zeroCrossingRate > 0.02 && zeroCrossingRate < 0.25;
        return spectralOk && zcrOk;
    }
    recordPerformance(time) {
        this.performanceMetrics.push(time);
        // Keep only last 1000 measurements
        if (this.performanceMetrics.length > 1000) {
            this.performanceMetrics.shift();
        }
    }
}
exports.VoiceActivityDetector = VoiceActivityDetector;
//# sourceMappingURL=VoiceActivityDetector.js.map