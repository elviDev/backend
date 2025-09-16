/**
 * Temporal Processor - Phase 2 AI Intelligence
 * Processes temporal references in voice commands
 *
 * Success Criteria:
 * - Handles "next Friday", "in 2 weeks", "tomorrow"
 * - Timezone-aware date resolution
 * - Business day calculations
 * - 90%+ accuracy for common date expressions
 */
export interface ResolvedDate {
    date: Date;
    confidence: number;
    originalText: string;
    interpretation: string;
}
export interface TemporalContext {
    currentTime: string;
    timezone: string;
    businessHours: {
        start: string;
        end: string;
    };
    workingDays: number[];
}
export declare class TemporalProcessor {
    private readonly WEEKDAYS;
    private readonly MONTHS;
    private readonly TIME_PATTERNS;
    constructor();
    /**
     * Get current temporal context for a timezone
     */
    getCurrentTemporalContext(timezone?: string): TemporalContext;
    /**
     * Resolve a date expression to actual date
     */
    resolveDate(dateText: string, context: TemporalContext): Promise<ResolvedDate | null>;
    /**
     * Parse multiple date references in text
     */
    resolveDatesInText(text: string, context: TemporalContext): Promise<ResolvedDate[]>;
    /**
     * Check if a date is a business day
     */
    isBusinessDay(date: Date, context: TemporalContext): boolean;
    /**
     * Get next business day from a given date
     */
    getNextBusinessDay(date: Date, context: TemporalContext): Date;
    /**
     * Add business days to a date
     */
    addBusinessDays(date: Date, days: number, context: TemporalContext): Date;
    private handleToday;
    private handleTomorrow;
    private handleYesterday;
    private handleNextWeekday;
    private handleThisWeekday;
    private handleLastWeekday;
    private handleWeekday;
    private handleNextWeek;
    private handleThisWeek;
    private handleLastWeek;
    private handleNextMonth;
    private handleThisMonth;
    private handleLastMonth;
    private handleInDays;
    private handleInWeeks;
    private handleInMonths;
    private handleByWeekday;
    private handleByRelative;
    private handleByEndOf;
    private handleNumericDate;
    private handleMonthDay;
    private handleTimeSpec;
    private handleSimpleTime;
    private parseNaturalLanguageDate;
}
//# sourceMappingURL=TemporalProcessor.d.ts.map