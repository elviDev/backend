/**
 * File Command Parser - Phase 2 Voice File Operations
 * Parses file-related voice commands and extracts parameters
 *
 * Success Criteria:
 * - Supports upload, share, organize, delete operations
 * - Extracts file names, descriptions, target entities
 * - Handles file type inference
 * - Context-aware target resolution
 */
import { ContextData, UserContext } from '../../voice/types';
export interface ParsedFileCommand {
    id: string;
    operation: FileOperation;
    fileName?: string | undefined;
    description?: string | undefined;
    targetChannels: ResolvedEntity[];
    targetTasks: ResolvedEntity[];
    targetUsers: ResolvedEntity[];
    fileType?: string | undefined;
    tags: string[];
    priority: 'low' | 'medium' | 'high';
    processingTime: number;
    confidence: number;
}
export declare enum FileOperation {
    UPLOAD = "upload",
    SHARE = "share",
    ORGANIZE = "organize",
    DELETE = "delete",
    SEARCH = "search",
    DOWNLOAD = "download"
}
export interface ResolvedEntity {
    id: string;
    name: string;
    type: string;
    confidence: number;
}
export interface FileParameters {
    fileName?: string | undefined;
    description?: string | undefined;
    targetEntities: string[];
    fileType?: string | undefined;
    operation: FileOperation;
    tags: string[];
    priority: string;
}
export declare class FileCommandParser {
    private performanceMetrics;
    constructor();
    /**
     * Parse file-related voice command
     * Target: <500ms parsing time
     */
    parseFileCommand(transcript: string, context: ContextData, userContext: UserContext): Promise<ParsedFileCommand>;
    /**
     * Extract file parameters from transcript
     */
    extractFileParameters(transcript: string): FileParameters;
    /**
     * Resolve file targets with context awareness
     */
    resolveFileTargets(targetEntities: string[], context: ContextData): Promise<{
        channels: ResolvedEntity[];
        tasks: ResolvedEntity[];
        users: ResolvedEntity[];
    }>;
    /**
     * Identify the primary file operation from transcript
     */
    private identifyFileOperation;
    /**
     * Extract target entities (channels, tasks, users) from transcript
     */
    private extractTargetEntities;
    /**
     * Extract file type from transcript
     */
    private extractFileType;
    /**
     * Infer file type from context and file name
     */
    private inferFileType;
    /**
     * Extract tags from transcript
     */
    private extractTags;
    /**
     * Generate contextual tags based on transcript content
     */
    private generateContextualTags;
    /**
     * Determine priority level from transcript
     */
    private determinePriority;
    /**
     * Find best matching channel from context
     */
    private findBestChannelMatch;
    /**
     * Find best matching task from context
     */
    private findBestTaskMatch;
    /**
     * Find best matching user from context
     */
    private findBestUserMatch;
    /**
     * Calculate match confidence between two strings
     */
    private calculateMatchConfidence;
    /**
     * Calculate overall confidence for the parsed command
     */
    private calculateConfidence;
    /**
     * Get performance statistics
     */
    getPerformanceStats(): {
        averageParsingTime: number;
        p95ParsingTime: number;
        totalCommandsParsed: number;
    };
    private recordPerformance;
}
//# sourceMappingURL=FileCommandParser.d.ts.map