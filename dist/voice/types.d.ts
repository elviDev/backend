/**
 * Voice Processing Types and Interfaces - Phase 2
 * Central type definitions for voice processing pipeline
 */
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
    language?: string;
    context?: string;
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
export interface TranscriptionOptions {
    language?: string;
    prompt?: string;
    temperature?: number;
    responseFormat?: 'json' | 'text' | 'verbose_json';
}
export interface TranscriptResult {
    transcript: string;
    confidence: number;
    language: string;
    processingTime: number;
    segments?: TranscriptSegment[];
    error?: string;
}
export interface TranscriptSegment {
    id: string;
    start: number;
    end: number;
    text: string;
    confidence: number;
    words?: TranscriptWord[];
}
export interface TranscriptWord {
    word: string;
    start: number;
    end: number;
    confidence: number;
}
export interface UserContext {
    userId: string;
    organizationId: string;
    sessionId?: string;
    language?: string;
    timezone?: string;
}
export interface ContextData {
    user: {
        id: string;
        name: string;
        role: string;
        email: string;
    };
    organization: {
        id: string;
        name: string;
        timezone: string;
    };
    activeChannels: Array<{
        id: string;
        name: string;
        type: string;
        memberCount: number;
    }>;
    recentTasks: Array<{
        id: string;
        title: string;
        status: string;
        assignedTo: string[];
        dueDate?: string;
    }>;
    teamMembers: Array<{
        id: string;
        name: string;
        role: string;
        status: 'online' | 'offline' | 'busy';
    }>;
    temporal: {
        currentTime: string;
        timezone: string;
        businessHours: {
            start: string;
            end: string;
        };
    };
    conversation?: {
        recentCommands: VoiceCommand[];
        context: string[];
    };
}
export interface ParsedCommand {
    id: string;
    userId: string;
    transcript: string;
    originalTranscript: string;
    intent: string;
    confidence: number;
    actions: CommandAction[];
    entities: ResolvedEntities;
    contextReferences?: {
        pronouns: string[];
        temporalContext: string[];
        implicitEntities: string[];
    };
    processingTime: number;
    timestamp: string;
}
export interface CommandAction {
    id?: string;
    type: ActionType;
    parameters: Record<string, any>;
    priority: number;
    dependencies: string[];
    estimatedDuration?: string;
    critical?: boolean;
    order?: number;
    validated?: boolean;
}
export type ActionType = 'CREATE_CHANNEL' | 'CREATE_TASK' | 'ASSIGN_USERS' | 'SEND_MESSAGE' | 'UPLOAD_FILE' | 'SET_DEADLINE' | 'CREATE_DEPENDENCY' | 'UPDATE_STATUS' | 'SCHEDULE_MEETING' | 'GENERATE_REPORT';
export interface ResolvedEntities {
    users: Array<{
        name: string;
        resolved_id: string;
        confidence: number;
    }>;
    channels: Array<{
        name: string;
        resolved_id: string;
        confidence: number;
    }>;
    tasks: Array<{
        title: string;
        resolved_id: string;
        confidence: number;
    }>;
    dates: Array<{
        text: string;
        resolved_date: string;
        confidence: number;
    }>;
    files: Array<{
        name: string;
        resolved_id?: string;
        confidence: number;
    }>;
}
export interface ExecutionPlan {
    id: string;
    steps: ExecutionStep[];
    totalActions: number;
    estimatedTime: number;
    createdAt: string;
}
export interface ExecutionStep {
    id: string;
    actions: CommandAction[];
    parallel: boolean;
    dependencies: string[];
    estimatedTime: number;
}
export interface ExecutionResult {
    id: string;
    commandId: string;
    success: boolean;
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    results: ActionResult[];
    error?: string;
    executionTime: number;
    rollbackApplied?: boolean;
    timestamp: string;
}
export interface ActionResult {
    actionId: string;
    actionType: string;
    success: boolean;
    data?: any;
    error?: string;
    executionTime: number;
    timestamp: string;
}
export interface VoiceCommand {
    id: string;
    userId: string;
    transcript: string;
    processedTranscript?: string;
    intentAnalysis?: any;
    actionsPlanned?: CommandAction[];
    actionsExecuted?: ActionResult[];
    executionStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
    processingTime: number;
    errorDetails?: any;
    createdAt: string;
}
export interface VoiceFileUpload {
    userId: string;
    fileName: string;
    contentType: string;
    fileSize?: number;
    description?: string;
    targetChannels?: string[];
    targetTasks?: string[];
    transcript: string;
}
export interface FileUploadResult {
    success: boolean;
    fileId: string;
    uploadUrl: string;
    finalUrl: string;
    expiresAt: string;
}
export interface FileOperationResult {
    success: boolean;
    operation: string;
    result: any;
}
export interface BroadcastEvent {
    type: string;
    data: any;
    timestamp: string;
    source: string;
}
export interface BroadcastTarget {
    type: 'user' | 'channel' | 'room';
    id: string;
}
export interface PerformanceMetrics {
    component: string;
    operation: string;
    duration: number;
    success: boolean;
    metadata?: Record<string, any>;
    timestamp: string;
}
export interface VoiceProcessingMetrics {
    transcriptionTime: number;
    processingTime: number;
    executionTime: number;
    totalTime: number;
    accuracy: number;
    success: boolean;
    commandId: string;
    userId: string;
    timestamp: string;
}
export declare class VoiceProcessingError extends Error {
    context?: Record<string, any> | undefined;
    constructor(message: string, context?: Record<string, any> | undefined);
}
export declare class AIProcessingError extends Error {
    context?: Record<string, any> | undefined;
    constructor(message: string, context?: Record<string, any> | undefined);
}
export declare class ExecutionError extends Error {
    actionResult?: ActionResult | undefined;
    constructor(message: string, actionResult?: ActionResult | undefined);
}
export declare class FileUploadError extends Error {
    context?: Record<string, any> | undefined;
    constructor(message: string, context?: Record<string, any> | undefined);
}
export interface ExecutionSummary {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    totalExecutionTime: number;
    averageActionTime: number;
    affectedEntities: string[];
    actionBreakdown: Record<string, {
        success: number;
        failed: number;
        avgTime: number;
    }>;
}
export interface AuditEntry {
    id: string;
    commandId: string;
    userId: string;
    organizationId: string;
    sessionId: string;
    timestamp: string;
    originalTranscript: string;
    parsedIntent: string;
    executionSummary: ExecutionSummary;
    success: boolean;
    error?: string | undefined;
    metadata: {
        userAgent: string;
        clientVersion: string;
        processingTime: number;
    };
}
//# sourceMappingURL=types.d.ts.map