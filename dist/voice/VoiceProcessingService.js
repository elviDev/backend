"use strict";
/**
 * Voice Processing Service - Phase 2 Integration Layer
 * Orchestrates the complete voice processing pipeline
 *
 * Success Criteria Integration:
 * - End-to-end voice command processing <2 seconds (simple) / <5 seconds (complex)
 * - Coordinates audio stream, transcription, AI parsing, and execution
 * - Provides comprehensive error handling and performance monitoring
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceProcessingService = void 0;
const events_1 = require("events");
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../utils/logger");
const AudioStreamManager_1 = require("./stream/AudioStreamManager");
const WhisperService_1 = require("./transcription/WhisperService");
const AICommandParser_1 = require("../ai/commands/AICommandParser");
const MultiActionExecutor_1 = require("../ai/execution/MultiActionExecutor");
const types_1 = require("./types");
class VoiceProcessingService extends events_1.EventEmitter {
    audioStreamManager;
    whisperService;
    aiCommandParser;
    multiActionExecutor;
    performanceMetrics = [];
    constructor() {
        super();
        this.audioStreamManager = new AudioStreamManager_1.AudioStreamManager();
        this.whisperService = new WhisperService_1.WhisperService();
        this.aiCommandParser = new AICommandParser_1.AICommandParser();
        this.multiActionExecutor = new MultiActionExecutor_1.MultiActionExecutor();
        this.setupEventHandlers();
        logger_1.logger.info('Voice Processing Service initialized');
    }
    /**
     * Process complete voice command from audio to parsed command
     * This is the main integration point for the voice processing pipeline
     */
    async processVoiceCommand(audioBuffer, userContext, options = {}) {
        const startTime = perf_hooks_1.performance.now();
        const commandId = `cmd-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        logger_1.logger.info('Starting voice command processing', {
            commandId,
            userId: userContext.userId,
            audioSize: audioBuffer.length,
            options,
        });
        try {
            // Step 1: Audio preprocessing and validation
            const preprocessingStart = perf_hooks_1.performance.now();
            await this.validateAudioInput(audioBuffer);
            const preprocessingTime = perf_hooks_1.performance.now() - preprocessingStart;
            this.emit('preprocessing_complete', {
                commandId,
                processingTime: preprocessingTime,
            });
            // Step 2: Transcription
            const transcriptionStart = perf_hooks_1.performance.now();
            const transcriptOptions = {};
            if (userContext.language !== undefined) {
                transcriptOptions.language = userContext.language;
            }
            const transcriptResult = await this.whisperService.transcribeAudio(audioBuffer, transcriptOptions);
            const transcriptionTime = perf_hooks_1.performance.now() - transcriptionStart;
            if (!transcriptResult.transcript || transcriptResult.transcript.trim().length === 0) {
                throw new types_1.VoiceProcessingError('Empty transcription result');
            }
            this.emit('transcription_complete', {
                commandId,
                transcript: transcriptResult.transcript,
                confidence: transcriptResult.confidence,
                processingTime: transcriptionTime,
            });
            // Step 3: AI Command Parsing
            const parsingStart = perf_hooks_1.performance.now();
            const parsedCommand = await this.aiCommandParser.parseVoiceCommand(transcriptResult.transcript, userContext, {
                timeout: options.maxProcessingTime || 10000,
                enhanceWithContext: true,
            });
            const parsingTime = perf_hooks_1.performance.now() - parsingStart;
            this.emit('parsing_complete', {
                commandId,
                intent: parsedCommand.intent,
                actionCount: parsedCommand.actions.length,
                confidence: parsedCommand.confidence,
                processingTime: parsingTime,
            });
            // Calculate total processing time
            const totalTime = perf_hooks_1.performance.now() - startTime;
            // Create comprehensive metrics
            const metrics = {
                transcriptionTime,
                processingTime: parsingTime,
                executionTime: 0, // Will be set when command is executed
                totalTime,
                accuracy: Math.min(transcriptResult.confidence, parsedCommand.confidence),
                success: true,
                commandId,
                userId: userContext.userId,
                timestamp: new Date().toISOString(),
            };
            // Record metrics
            this.recordMetrics(metrics);
            // Check performance targets
            this.validatePerformanceTargets(totalTime, parsedCommand.actions.length);
            logger_1.logger.info('Voice command processing completed successfully', {
                commandId,
                totalTime: `${totalTime.toFixed(2)}ms`,
                transcript: transcriptResult.transcript.substring(0, 100) + '...',
                intent: parsedCommand.intent,
                actionCount: parsedCommand.actions.length,
            });
            this.emit('processing_complete', {
                commandId,
                success: true,
                metrics,
            });
            return {
                success: true,
                command: parsedCommand,
                metrics,
            };
        }
        catch (error) {
            const totalTime = perf_hooks_1.performance.now() - startTime;
            const metrics = {
                transcriptionTime: 0,
                processingTime: 0,
                executionTime: 0,
                totalTime,
                accuracy: 0,
                success: false,
                commandId,
                userId: userContext.userId,
                timestamp: new Date().toISOString(),
            };
            this.recordMetrics(metrics);
            logger_1.logger.error('Voice command processing failed', {
                commandId,
                error: error instanceof Error ? error.message : String(error),
                totalTime: `${totalTime.toFixed(2)}ms`,
                userId: userContext.userId,
            });
            this.emit('processing_error', {
                commandId,
                error: error instanceof Error ? error.message : String(error),
                metrics,
            });
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                metrics,
            };
        }
    }
    /**
     * Process and execute complete voice command from audio to final result
     * This includes transcription, AI parsing, and multi-action execution
     */
    async processAndExecuteVoiceCommand(audioBuffer, userContext, options = {}) {
        const startTime = perf_hooks_1.performance.now();
        const commandId = `cmd-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        try {
            // Step 1: Process voice command (transcription + AI parsing)
            const processingResult = await this.processVoiceCommand(audioBuffer, userContext, options);
            if (!processingResult.success || !processingResult.command) {
                return {
                    success: false,
                    error: processingResult.error || 'Voice command processing failed',
                    metrics: processingResult.metrics,
                };
            }
            const parsedCommand = processingResult.command;
            // Step 2: Execute multi-action command if it has actions
            let executionResult;
            if (parsedCommand.actions && parsedCommand.actions.length > 0) {
                logger_1.logger.info('Executing multi-action command', {
                    commandId: parsedCommand.id,
                    actionCount: parsedCommand.actions.length,
                    userId: userContext.userId,
                });
                const executionStart = perf_hooks_1.performance.now();
                executionResult = await this.multiActionExecutor.executeMultiActionCommand(parsedCommand, userContext, {
                    transactionTimeout: options.maxProcessingTime || 30000,
                    auditLogging: true,
                    progressTracking: true,
                });
                const executionTime = perf_hooks_1.performance.now() - executionStart;
                // Update metrics with execution time
                processingResult.metrics.executionTime = executionTime;
                processingResult.metrics.totalTime = perf_hooks_1.performance.now() - startTime;
                this.emit('command_execution_complete', {
                    commandId: parsedCommand.id,
                    success: executionResult.success,
                    executionTime,
                    actionCount: executionResult.executedActions.length,
                });
                logger_1.logger.info('Multi-action command execution completed', {
                    commandId: parsedCommand.id,
                    success: executionResult.success,
                    executionTime: `${executionTime.toFixed(2)}ms`,
                    successfulActions: executionResult.executedActions.length,
                    failedActions: executionResult.failedActions.length,
                });
            }
            const totalTime = perf_hooks_1.performance.now() - startTime;
            processingResult.metrics.totalTime = totalTime;
            return executionResult && !executionResult.success
                ? {
                    success: false,
                    command: parsedCommand,
                    executionResult,
                    metrics: processingResult.metrics,
                    error: 'Command execution failed',
                }
                : {
                    success: processingResult.success,
                    command: parsedCommand,
                    executionResult,
                    metrics: processingResult.metrics,
                };
        }
        catch (error) {
            const totalTime = perf_hooks_1.performance.now() - startTime;
            const errorMetrics = {
                transcriptionTime: 0,
                processingTime: 0,
                executionTime: 0,
                totalTime,
                accuracy: 0,
                success: false,
                commandId,
                userId: userContext.userId,
                timestamp: new Date().toISOString(),
            };
            logger_1.logger.error('Complete voice command processing failed', {
                commandId,
                error: error instanceof Error ? error.message : String(error),
                totalTime: `${totalTime.toFixed(2)}ms`,
                userId: userContext.userId,
            });
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                metrics: errorMetrics,
            };
        }
    }
    /**
     * Process streaming audio for real-time transcription
     */
    async processStreamingAudio(audioStream, userContext, options = {}) {
        const streamId = `stream-${Date.now()}`;
        logger_1.logger.info('Starting streaming audio processing', {
            streamId,
            userId: userContext.userId,
        });
        return async function* () {
            try {
                const transcriptStream = await this.whisperService.transcribeStream(audioStream);
                for await (const partialTranscript of transcriptStream) {
                    if (partialTranscript.transcript && partialTranscript.transcript.trim().length > 0) {
                        try {
                            // Parse partial transcript
                            const partialCommand = await this.aiCommandParser.parseVoiceCommand(partialTranscript.transcript, userContext, { timeout: 5000 });
                            yield {
                                id: partialCommand.id,
                                transcript: partialTranscript.transcript,
                                intent: partialCommand.intent,
                                confidence: Math.min(partialTranscript.confidence || 0.5, partialCommand.confidence),
                                actions: partialCommand.actions.slice(0, 3), // Limit actions for streaming
                                timestamp: new Date().toISOString(),
                            };
                        }
                        catch (error) {
                            logger_1.logger.warn('Partial command parsing failed', {
                                streamId,
                                error: error instanceof Error ? error.message : String(error),
                                transcript: partialTranscript.transcript?.substring(0, 50),
                            });
                        }
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Streaming audio processing failed', {
                    streamId,
                    error: error instanceof Error ? error.message : String(error),
                });
                yield {
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: new Date().toISOString(),
                };
            }
        }.call(this);
    }
    /**
     * Get comprehensive service performance statistics
     */
    getPerformanceStatistics() {
        const overallStats = this.calculateOverallStats();
        return {
            overall: overallStats,
            audioProcessing: this.audioStreamManager.getPerformanceMetrics(),
            transcription: this.whisperService.getPerformanceStats(),
            aiParsing: this.aiCommandParser.getPerformanceStats(),
        };
    }
    /**
     * Get service health status
     */
    getHealthStatus() {
        const whisperHealth = this.whisperService.getHealthStatus();
        const overallStats = this.calculateOverallStats();
        let status = 'healthy';
        // Check overall performance
        if (overallStats.averageProcessingTime > 5000) {
            status = 'unhealthy';
        }
        else if (overallStats.averageProcessingTime > 3000) {
            status = 'degraded';
        }
        // Check success rate
        if (overallStats.successRate < 0.9) {
            status = 'unhealthy';
        }
        else if (overallStats.successRate < 0.95) {
            status = 'degraded';
        }
        // Factor in component health
        if (whisperHealth.status === 'unhealthy') {
            status = 'unhealthy';
        }
        else if (whisperHealth.status === 'degraded' && status === 'healthy') {
            status = 'degraded';
        }
        return {
            status,
            components: {
                whisper: whisperHealth,
                audioStream: this.audioStreamManager.getPerformanceMetrics(),
                aiParsing: this.aiCommandParser.getPerformanceStats(),
            },
            metrics: overallStats,
        };
    }
    async validateAudioInput(audioBuffer) {
        if (!audioBuffer || audioBuffer.length === 0) {
            throw new types_1.VoiceProcessingError('Empty audio buffer');
        }
        if (audioBuffer.length < 1000) {
            throw new types_1.VoiceProcessingError('Audio buffer too small (minimum 1KB)');
        }
        if (audioBuffer.length > 50 * 1024 * 1024) {
            throw new types_1.VoiceProcessingError('Audio buffer too large (maximum 50MB)');
        }
        // Basic audio format validation (check for WAV header)
        if (audioBuffer.length > 12) {
            const header = audioBuffer.toString('ascii', 0, 4);
            if (header !== 'RIFF') {
                logger_1.logger.warn('Audio format validation: Not a standard WAV file');
            }
        }
    }
    validatePerformanceTargets(totalTime, actionCount) {
        // Simple commands should complete in <2 seconds
        if (actionCount <= 2 && totalTime > 2000) {
            logger_1.logger.warn('Performance target missed: Simple command exceeded 2 seconds', {
                totalTime: `${totalTime.toFixed(2)}ms`,
                actionCount,
                target: '2000ms',
            });
        }
        // Complex commands should complete in <5 seconds
        if (actionCount > 2 && totalTime > 5000) {
            logger_1.logger.warn('Performance target missed: Complex command exceeded 5 seconds', {
                totalTime: `${totalTime.toFixed(2)}ms`,
                actionCount,
                target: '5000ms',
            });
        }
    }
    recordMetrics(metrics) {
        this.performanceMetrics.push(metrics);
        // Keep only last 1000 metrics
        if (this.performanceMetrics.length > 1000) {
            this.performanceMetrics.shift();
        }
    }
    calculateOverallStats() {
        if (this.performanceMetrics.length === 0) {
            return {
                totalCommands: 0,
                successfulCommands: 0,
                successRate: 0,
                averageProcessingTime: 0,
                averageTranscriptionTime: 0,
                averageParsingTime: 0,
                p95ProcessingTime: 0,
                p99ProcessingTime: 0,
            };
        }
        const successfulMetrics = this.performanceMetrics.filter((m) => m.success);
        const sortedTimes = this.performanceMetrics.map((m) => m.totalTime).sort((a, b) => a - b);
        return {
            totalCommands: this.performanceMetrics.length,
            successfulCommands: successfulMetrics.length,
            successRate: successfulMetrics.length / this.performanceMetrics.length,
            averageProcessingTime: this.performanceMetrics.reduce((sum, m) => sum + m.totalTime, 0) /
                this.performanceMetrics.length,
            averageTranscriptionTime: successfulMetrics.reduce((sum, m) => sum + m.transcriptionTime, 0) /
                Math.max(successfulMetrics.length, 1),
            averageParsingTime: successfulMetrics.reduce((sum, m) => sum + m.processingTime, 0) /
                Math.max(successfulMetrics.length, 1),
            p95ProcessingTime: sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0,
            p99ProcessingTime: sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0,
        };
    }
    setupEventHandlers() {
        // Audio stream events
        this.audioStreamManager.on('stream_error', (data) => {
            this.emit('audio_stream_error', data);
        });
        this.audioStreamManager.on('audio_segment_ready', (segment) => {
            this.emit('audio_segment_ready', segment);
        });
        // Add error handling for uncaught events
        this.on('error', (error) => {
            logger_1.logger.error('Voice processing service error', { error: error.message });
        });
    }
}
exports.VoiceProcessingService = VoiceProcessingService;
//# sourceMappingURL=VoiceProcessingService.js.map