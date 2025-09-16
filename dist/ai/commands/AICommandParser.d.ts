/**
 * AI Command Parser - Phase 2 Voice Processing
 * GPT-4 Turbo integration for intelligent command parsing
 *
 * Success Criteria:
 * - Parses single and multi-action commands with >95% accuracy
 * - Extracts entities (users, channels, dates, etc.) correctly
 * - Confidence scoring for each parsed element
 * - Processing time <1 second per command
 */
import { ParsedCommand, UserContext } from '../../voice/types';
export interface ParseCommandOptions {
    maxRetries?: number;
    timeout?: number;
    temperature?: number;
    enhanceWithContext?: boolean;
}
export declare class AICommandParser {
    private openai;
    private contextManager;
    private promptCache;
    private performanceMetrics;
    private requestCount;
    private systemPromptTemplate;
    constructor();
    /**
     * Parse voice command using GPT-4
     * Target: <1 second processing time
     */
    parseVoiceCommand(transcript: string, userContext: UserContext, options?: ParseCommandOptions): Promise<ParsedCommand>;
    /**
     * Batch parse multiple commands for efficiency
     */
    parseMultipleCommands(commands: Array<{
        transcript: string;
        userContext: UserContext;
    }>, options?: ParseCommandOptions): Promise<ParsedCommand[]>;
    /**
     * Get parsing performance statistics
     */
    getPerformanceStats(): Record<string, {
        average: number;
        p95: number;
        p99: number;
        count: number;
    }>;
    /**
     * Clear performance metrics
     */
    clearMetrics(): void;
    private validateInput;
    private buildSystemPrompt;
    private buildUserPrompt;
    private makeGPTRequest;
    private parseAndValidateResponse;
    private validateParsedResponse;
    private processActions;
    private validateEntities;
    private isActionCritical;
    private recordMetric;
    private cleanPromptCache;
}
//# sourceMappingURL=AICommandParser.d.ts.map