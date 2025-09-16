"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioPreprocessor = void 0;
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../../utils/logger");
class AudioPreprocessor {
    config;
    performanceMetrics = [];
    // State for running calculations
    runningRMS = 0;
    noiseProfile = null;
    agcGain = 1.0;
    dcOffset = 0;
    // Filter state (simple IIR filters)
    highPassState = {
        x1: 0,
        x2: 0,
        y1: 0,
        y2: 0,
    };
    lowPassState = {
        x1: 0,
        x2: 0,
        y1: 0,
        y2: 0,
    };
    constructor(config = {}) {
        this.config = {
            noiseReduction: true,
            volumeNormalization: true,
            highPassFilter: true,
            lowPassFilter: false,
            agcEnabled: true,
            targetRMS: 0.1, // 10% of full scale
            noiseGateThreshold: 0.01, // 1% of full scale
            highPassFreq: 80, // Remove low frequency noise
            lowPassFreq: 8000, // Remove high frequency noise above speech
            sampleRate: 16000,
            ...config,
        };
        logger_1.logger.debug('Audio preprocessor initialized', { config: this.config });
    }
    /**
     * Process audio buffer with all enabled preprocessing steps
     * Target: <50ms processing time
     */
    async process(audioBuffer) {
        const startTime = perf_hooks_1.performance.now();
        try {
            // Convert to float samples for processing
            const samples = this.bufferToFloat32(audioBuffer);
            const originalRMS = this.calculateRMS(samples);
            let processedSamples = new Float32Array(samples.length);
            processedSamples.set(samples);
            const appliedProcessing = [];
            // Step 1: DC offset removal
            processedSamples = this.removeDCOffset(processedSamples);
            appliedProcessing.push('dc_removal');
            // Step 2: High-pass filter (remove low frequency noise)
            if (this.config.highPassFilter) {
                processedSamples = this.applyHighPassFilter(processedSamples);
                appliedProcessing.push('high_pass_filter');
            }
            // Step 3: Low-pass filter (anti-aliasing)
            if (this.config.lowPassFilter) {
                processedSamples = this.applyLowPassFilter(processedSamples);
                appliedProcessing.push('low_pass_filter');
            }
            // Step 4: Noise gate
            processedSamples = this.applyNoiseGate(processedSamples);
            appliedProcessing.push('noise_gate');
            // Step 5: Noise reduction
            let noiseReductionAmount = 0;
            if (this.config.noiseReduction) {
                const result = this.applyNoiseReduction(processedSamples);
                processedSamples = result.samples;
                noiseReductionAmount = result.reductionAmount;
                appliedProcessing.push('noise_reduction');
            }
            // Step 6: Automatic Gain Control
            if (this.config.agcEnabled) {
                processedSamples = this.applyAutomaticGainControl(processedSamples);
                appliedProcessing.push('agc');
            }
            // Step 7: Volume normalization
            let clippingPrevented = false;
            if (this.config.volumeNormalization) {
                const result = this.normalizeVolume(processedSamples);
                processedSamples = result.samples;
                clippingPrevented = result.clippingPrevented;
                appliedProcessing.push('volume_normalization');
            }
            // Convert back to buffer
            const processedBuffer = this.float32ToBuffer(processedSamples);
            const processingTime = perf_hooks_1.performance.now() - startTime;
            // Record performance
            this.recordPerformance(processingTime);
            // Log slow processing
            if (processingTime > 50) {
                logger_1.logger.warn('Slow audio preprocessing', {
                    processingTime: `${processingTime.toFixed(2)}ms`,
                    bufferSize: audioBuffer.length,
                    appliedProcessing,
                });
            }
            const outputRMS = this.calculateRMS(processedSamples);
            logger_1.logger.debug('Audio preprocessing complete', {
                processingTime: `${processingTime.toFixed(2)}ms`,
                inputRMS: originalRMS.toFixed(4),
                outputRMS: outputRMS.toFixed(4),
                appliedProcessing,
                noiseReduction: noiseReductionAmount.toFixed(4),
            });
            return processedBuffer;
        }
        catch (error) {
            const processingTime = perf_hooks_1.performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger_1.logger.error('Audio preprocessing failed', {
                error: errorMessage,
                processingTime: `${processingTime.toFixed(2)}ms`,
                bufferSize: audioBuffer.length,
            });
            // Return original buffer on error
            return audioBuffer;
        }
    }
    /**
     * Process with detailed results
     */
    async processDetailed(audioBuffer) {
        const startTime = perf_hooks_1.performance.now();
        const samples = this.bufferToFloat32(audioBuffer);
        const inputRMS = this.calculateRMS(samples);
        const processedBuffer = await this.process(audioBuffer);
        const processedSamples = this.bufferToFloat32(processedBuffer);
        const outputRMS = this.calculateRMS(processedSamples);
        const processingTime = perf_hooks_1.performance.now() - startTime;
        return {
            processedAudio: processedBuffer,
            processingTime,
            applied: ['preprocessing_pipeline'],
            metrics: {
                inputRMS,
                outputRMS,
                noiseReduction: Math.max(0, inputRMS - outputRMS),
                clippingPrevented: this.checkForClipping(processedSamples),
            },
        };
    }
    /**
     * Update noise profile for noise reduction
     */
    updateNoiseProfile(noiseSample) {
        const samples = this.bufferToFloat32(noiseSample);
        // Simple noise profiling - calculate spectral characteristics
        this.noiseProfile = new Float32Array(256); // Frequency bins
        // Simple FFT-like analysis (simplified for real-time processing)
        for (let i = 0; i < this.noiseProfile.length; i++) {
            let sum = 0;
            const freqBin = (i / this.noiseProfile.length) * (this.config.sampleRate / 2);
            // Calculate energy in this frequency bin
            for (let j = 0; j < samples.length - 1; j++) {
                const phase = (2 * Math.PI * freqBin * j) / this.config.sampleRate;
                sum += samples[j] * Math.cos(phase);
            }
            this.noiseProfile[i] = Math.abs(sum) / samples.length;
        }
        logger_1.logger.info('Noise profile updated', {
            sampleLength: samples.length,
            profileBins: this.noiseProfile.length,
        });
    }
    /**
     * Get performance statistics
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
    bufferToFloat32(buffer) {
        const samples = new Float32Array(buffer.length / 2);
        for (let i = 0; i < samples.length; i++) {
            samples[i] = buffer.readInt16LE(i * 2) / 32768.0;
        }
        return samples;
    }
    float32ToBuffer(samples) {
        const buffer = Buffer.allocUnsafe(samples.length * 2);
        for (let i = 0; i < samples.length; i++) {
            const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
            buffer.writeInt16LE(Math.round(sample * 32767), i * 2);
        }
        return buffer;
    }
    calculateRMS(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            const sample = samples[i] ?? 0;
            sum += sample * sample;
        }
        return Math.sqrt(sum / samples.length);
    }
    removeDCOffset(samples) {
        // Calculate DC offset
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] ?? 0;
        }
        const dcOffset = sum / samples.length;
        // Remove DC offset
        const output = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            output[i] = (samples[i] ?? 0) - dcOffset;
        }
        this.dcOffset = dcOffset;
        return output;
    }
    applyHighPassFilter(samples) {
        const output = new Float32Array(samples.length);
        // Simple high-pass filter (80Hz cutoff)
        const fc = this.config.highPassFreq / this.config.sampleRate;
        const alpha = 1 / (1 + 2 * Math.PI * fc);
        for (let i = 0; i < samples.length; i++) {
            if (i === 0) {
                output[i] = alpha * (samples[i] ?? 0);
            }
            else {
                output[i] = alpha * ((output[i - 1] ?? 0) + (samples[i] ?? 0) - (samples[i - 1] ?? 0));
            }
        }
        return output;
    }
    applyLowPassFilter(samples) {
        const output = new Float32Array(samples.length);
        // Simple low-pass filter
        const fc = this.config.lowPassFreq / this.config.sampleRate;
        const alpha = (2 * Math.PI * fc) / (1 + 2 * Math.PI * fc);
        output[0] = samples[0] ?? 0;
        for (let i = 1; i < samples.length; i++) {
            output[i] = alpha * (samples[i] ?? 0) + (1 - alpha) * (output[i - 1] ?? 0);
        }
        return output;
    }
    applyNoiseGate(samples) {
        const output = new Float32Array(samples.length);
        const threshold = this.config.noiseGateThreshold;
        for (let i = 0; i < samples.length; i++) {
            const sample = samples[i] ?? 0;
            if (Math.abs(sample) > threshold) {
                output[i] = sample;
            }
            else {
                output[i] = 0; // Gate the signal
            }
        }
        return output;
    }
    applyNoiseReduction(samples) {
        const output = new Float32Array(samples.length);
        let reductionAmount = 0;
        if (!this.noiseProfile) {
            // Simple spectral subtraction without profile
            for (let i = 0; i < samples.length; i++) {
                const sample = samples[i] ?? 0;
                const originalMagnitude = Math.abs(sample);
                const reducedMagnitude = Math.max(0.1 * originalMagnitude, originalMagnitude - 0.02);
                output[i] = sample >= 0 ? reducedMagnitude : -reducedMagnitude;
                reductionAmount += originalMagnitude - Math.abs(output[i] ?? 0);
            }
        }
        else {
            // More sophisticated noise reduction would go here
            // For now, use simple approach
            for (let i = 0; i < samples.length; i++) {
                const sample = samples[i] ?? 0;
                output[i] = sample * 0.95; // Simple noise reduction
                reductionAmount += Math.abs(sample) * 0.05;
            }
        }
        return { samples: output, reductionAmount: reductionAmount / samples.length };
    }
    applyAutomaticGainControl(samples) {
        const output = new Float32Array(samples.length);
        const currentRMS = this.calculateRMS(samples);
        if (currentRMS > 0) {
            const targetGain = this.config.targetRMS / currentRMS;
            // Smooth gain changes to avoid artifacts
            const maxGainChange = 1.1; // Max 10% gain change per frame
            if (targetGain > this.agcGain * maxGainChange) {
                this.agcGain *= maxGainChange;
            }
            else if (targetGain < this.agcGain / maxGainChange) {
                this.agcGain /= maxGainChange;
            }
            else {
                this.agcGain = targetGain;
            }
            // Apply gain with limiting
            for (let i = 0; i < samples.length; i++) {
                output[i] = Math.max(-1, Math.min(1, (samples[i] ?? 0) * this.agcGain));
            }
        }
        else {
            // No signal, pass through
            output.set(samples);
        }
        return output;
    }
    normalizeVolume(samples) {
        const output = new Float32Array(samples.length);
        let clippingPrevented = false;
        // Find peak
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
            peak = Math.max(peak, Math.abs(samples[i] ?? 0));
        }
        if (peak > 0.95) {
            // Prevent clipping
            const scaleFactor = 0.95 / peak;
            for (let i = 0; i < samples.length; i++) {
                output[i] = (samples[i] ?? 0) * scaleFactor;
            }
            clippingPrevented = true;
        }
        else {
            output.set(samples);
        }
        return { samples: output, clippingPrevented };
    }
    checkForClipping(samples) {
        for (let i = 0; i < samples.length; i++) {
            if (Math.abs(samples[i] ?? 0) > 0.99) {
                return true;
            }
        }
        return false;
    }
    recordPerformance(time) {
        this.performanceMetrics.push(time);
        // Keep only last 1000 measurements
        if (this.performanceMetrics.length > 1000) {
            this.performanceMetrics.shift();
        }
    }
}
exports.AudioPreprocessor = AudioPreprocessor;
//# sourceMappingURL=AudioPreprocessor.js.map