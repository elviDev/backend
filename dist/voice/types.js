"use strict";
/**
 * Voice Processing Types and Interfaces - Phase 2
 * Central type definitions for voice processing pipeline
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileUploadError = exports.ExecutionError = exports.AIProcessingError = exports.VoiceProcessingError = void 0;
// Error Types
class VoiceProcessingError extends Error {
    context;
    constructor(message, context) {
        super(message);
        this.context = context;
        this.name = 'VoiceProcessingError';
    }
}
exports.VoiceProcessingError = VoiceProcessingError;
class AIProcessingError extends Error {
    context;
    constructor(message, context) {
        super(message);
        this.context = context;
        this.name = 'AIProcessingError';
    }
}
exports.AIProcessingError = AIProcessingError;
class ExecutionError extends Error {
    actionResult;
    constructor(message, actionResult) {
        super(message);
        this.actionResult = actionResult;
        this.name = 'ExecutionError';
    }
}
exports.ExecutionError = ExecutionError;
class FileUploadError extends Error {
    context;
    constructor(message, context) {
        super(message);
        this.context = context;
        this.name = 'FileUploadError';
    }
}
exports.FileUploadError = FileUploadError;
//# sourceMappingURL=types.js.map