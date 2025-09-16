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

import { logger } from '../../utils/logger';

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
  workingDays: number[]; // 1-7, Monday=1, Sunday=7
}

export class TemporalProcessor {
  private readonly WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  private readonly MONTHS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  
  // Common time patterns
  private readonly TIME_PATTERNS = [
    // Relative days
    { pattern: /\b(today|this day)\b/i, handler: this.handleToday.bind(this) },
    { pattern: /\b(tomorrow|next day)\b/i, handler: this.handleTomorrow.bind(this) },
    { pattern: /\b(yesterday|last day)\b/i, handler: this.handleYesterday.bind(this) },
    
    // Relative weeks
    { pattern: /\bnext (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, handler: this.handleNextWeekday.bind(this) },
    { pattern: /\bthis (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, handler: this.handleThisWeekday.bind(this) },
    { pattern: /\blast (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, handler: this.handleLastWeekday.bind(this) },
    
    // Specific weekdays
    { pattern: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, handler: this.handleWeekday.bind(this) },
    
    // Week references
    { pattern: /\bnext week\b/i, handler: this.handleNextWeek.bind(this) },
    { pattern: /\bthis week\b/i, handler: this.handleThisWeek.bind(this) },
    { pattern: /\blast week\b/i, handler: this.handleLastWeek.bind(this) },
    
    // Month references
    { pattern: /\bnext month\b/i, handler: this.handleNextMonth.bind(this) },
    { pattern: /\bthis month\b/i, handler: this.handleThisMonth.bind(this) },
    { pattern: /\blast month\b/i, handler: this.handleLastMonth.bind(this) },
    
    // Relative time periods
    { pattern: /\bin (\d+) (day|days)\b/i, handler: this.handleInDays.bind(this) },
    { pattern: /\bin (\d+) (week|weeks)\b/i, handler: this.handleInWeeks.bind(this) },
    { pattern: /\bin (\d+) (month|months)\b/i, handler: this.handleInMonths.bind(this) },
    
    // By/before/after patterns
    { pattern: /\bby (next )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, handler: this.handleByWeekday.bind(this) },
    { pattern: /\bby (tomorrow|next week|next month)\b/i, handler: this.handleByRelative.bind(this) },
    { pattern: /\bby the end of (this|next)? ?(week|month)\b/i, handler: this.handleByEndOf.bind(this) },
    
    // Specific dates (basic)
    { pattern: /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/, handler: this.handleNumericDate.bind(this) },
    { pattern: /\b(january|february|march|april|may|june|july|august|september|october|november|december) (\d{1,2})\b/i, handler: this.handleMonthDay.bind(this) },
    
    // Time specifications
    { pattern: /\bat (\d{1,2}):(\d{2})\s?(am|pm|AM|PM)?\b/i, handler: this.handleTimeSpec.bind(this) },
    { pattern: /\bat (\d{1,2})\s?(am|pm|AM|PM)\b/i, handler: this.handleSimpleTime.bind(this) },
  ];
  
  constructor() {
    logger.debug('Temporal Processor initialized');
  }
  
  /**
   * Get current temporal context for a timezone
   */
  getCurrentTemporalContext(timezone: string = 'UTC'): TemporalContext {
    const now = new Date();
    
    // Convert to specified timezone (simplified - in production use proper timezone library)
    const currentTime = now.toISOString();
    
    return {
      currentTime,
      timezone,
      businessHours: {
        start: '09:00',
        end: '17:00'
      },
      workingDays: [1, 2, 3, 4, 5] // Monday to Friday
    };
  }
  
  /**
   * Resolve a date expression to actual date
   */
  async resolveDate(
    dateText: string, 
    context: TemporalContext
  ): Promise<ResolvedDate | null> {
    try {
      const baseDate = new Date(context.currentTime);
      const originalText = dateText.trim();
      const lowerText = originalText.toLowerCase();
      
      // Try each pattern
      for (const { pattern, handler } of this.TIME_PATTERNS) {
        const match = lowerText.match(pattern);
        if (match) {
          const result = handler(match, baseDate);
          if (result) {
            logger.debug('Date resolved', {
              originalText,
              resolvedDate: result.date.toISOString(),
              confidence: result.confidence,
              interpretation: result.interpretation
            });
            
            return {
              ...result,
              originalText
            };
          }
        }
      }
      
      // Try natural language parsing as fallback
      const fallbackResult = this.parseNaturalLanguageDate(lowerText, baseDate);
      if (fallbackResult) {
        return {
          ...fallbackResult,
          originalText
        };
      }
      
      logger.debug('Date resolution failed', { originalText });
      return null;
      
    } catch (error) {
      logger.error('Date resolution error', {
        dateText,
        error: (error as any).message
      });
      
      return null;
    }
  }
  
  /**
   * Parse multiple date references in text
   */
  async resolveDatesInText(
    text: string,
    context: TemporalContext
  ): Promise<ResolvedDate[]> {
    const results: ResolvedDate[] = [];
    const processedRanges: Array<{start: number, end: number}> = [];
    
    // Find all potential date references
    for (const { pattern } of this.TIME_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags + 'g');
      
      while ((match = regex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        
        // Check if this range overlaps with already processed ranges
        const overlaps = processedRanges.some(range => 
          (start >= range.start && start <= range.end) ||
          (end >= range.start && end <= range.end)
        );
        
        if (!overlaps) {
          const dateText = match[0];
          const resolved = await this.resolveDate(dateText, context);
          
          if (resolved) {
            results.push(resolved);
            processedRanges.push({ start, end });
          }
        }
      }
    }
    
    return results;
  }
  
  /**
   * Check if a date is a business day
   */
  isBusinessDay(date: Date, context: TemporalContext): boolean {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to 1-7 scale
    
    return context.workingDays.includes(adjustedDay);
  }
  
  /**
   * Get next business day from a given date
   */
  getNextBusinessDay(date: Date, context: TemporalContext): Date {
    const result = new Date(date);
    
    do {
      result.setDate(result.getDate() + 1);
    } while (!this.isBusinessDay(result, context));
    
    return result;
  }
  
  /**
   * Add business days to a date
   */
  addBusinessDays(date: Date, days: number, context: TemporalContext): Date {
    const result = new Date(date);
    let addedDays = 0;
    
    while (addedDays < days) {
      result.setDate(result.getDate() + 1);
      if (this.isBusinessDay(result, context)) {
        addedDays++;
      }
    }
    
    return result;
  }
  
  // Handler methods for different date patterns
  private handleToday(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    return {
      date: new Date(baseDate),
      confidence: 1.0,
      originalText: match[0],
      interpretation: 'Today'
    };
  }
  
  private handleTomorrow(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + 1);
    
    return {
      date,
      confidence: 1.0,
      originalText: match[0],
      interpretation: 'Tomorrow'
    };
  }
  
  private handleYesterday(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - 1);
    
    return {
      date,
      confidence: 1.0,
      originalText: match[0],
      interpretation: 'Yesterday'
    };
  }
  
  private handleNextWeekday(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const weekday = (match[1] || '').toLowerCase();
    const targetDay = this.WEEKDAYS.indexOf(weekday);
    const currentDay = baseDate.getDay();
    
    const date = new Date(baseDate);
    let daysToAdd = targetDay - currentDay;
    
    if (daysToAdd <= 0) {
      daysToAdd += 7; // Next week
    }
    
    date.setDate(date.getDate() + daysToAdd);
    
    return {
      date,
      confidence: 0.95,
      originalText: match[0],
      interpretation: `Next ${weekday}`
    };
  }
  
  private handleThisWeekday(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const weekday = (match[1] || '').toLowerCase();
    const targetDay = this.WEEKDAYS.indexOf(weekday);
    const currentDay = baseDate.getDay();
    
    const date = new Date(baseDate);
    const daysToAdd = targetDay - currentDay;
    
    date.setDate(date.getDate() + daysToAdd);
    
    return {
      date,
      confidence: 0.9,
      originalText: match[0],
      interpretation: `This ${weekday}`
    };
  }
  
  private handleLastWeekday(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const weekday = (match[1] || '').toLowerCase();
    const targetDay = this.WEEKDAYS.indexOf(weekday);
    const currentDay = baseDate.getDay();
    
    const date = new Date(baseDate);
    let daysToSubtract = currentDay - targetDay;
    
    if (daysToSubtract <= 0) {
      daysToSubtract += 7; // Last week
    }
    
    date.setDate(date.getDate() - daysToSubtract);
    
    return {
      date,
      confidence: 0.9,
      originalText: match[0],
      interpretation: `Last ${weekday}`
    };
  }
  
  private handleWeekday(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    // Default to next occurrence of this weekday
    return this.handleNextWeekday(['next ' + match[0], match[0]], baseDate);
  }
  
  private handleNextWeek(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + 7);
    
    return {
      date,
      confidence: 0.8,
      originalText: match[0],
      interpretation: 'Next week (same day)'
    };
  }
  
  private handleThisWeek(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    // Return Friday of this week as default
    const date = new Date(baseDate);
    const currentDay = baseDate.getDay();
    const daysToFriday = 5 - currentDay;
    
    date.setDate(date.getDate() + daysToFriday);
    
    return {
      date,
      confidence: 0.7,
      originalText: match[0],
      interpretation: 'This week (Friday)'
    };
  }
  
  private handleLastWeek(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - 7);
    
    return {
      date,
      confidence: 0.8,
      originalText: match[0],
      interpretation: 'Last week (same day)'
    };
  }
  
  private handleNextMonth(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const date = new Date(baseDate);
    date.setMonth(date.getMonth() + 1);
    
    return {
      date,
      confidence: 0.8,
      originalText: match[0],
      interpretation: 'Next month (same day)'
    };
  }
  
  private handleThisMonth(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    // Return end of this month
    const date = new Date(baseDate);
    date.setMonth(date.getMonth() + 1, 0); // Last day of current month
    
    return {
      date,
      confidence: 0.7,
      originalText: match[0],
      interpretation: 'End of this month'
    };
  }
  
  private handleLastMonth(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const date = new Date(baseDate);
    date.setMonth(date.getMonth() - 1);
    
    return {
      date,
      confidence: 0.8,
      originalText: match[0],
      interpretation: 'Last month (same day)'
    };
  }
  
  private handleInDays(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const days = parseInt(match[1] || '0');
    const date = new Date(baseDate);
    date.setDate(date.getDate() + days);
    
    return {
      date,
      confidence: 0.95,
      originalText: match[0],
      interpretation: `In ${days} day${days > 1 ? 's' : ''}`
    };
  }
  
  private handleInWeeks(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const weeks = parseInt(match[1] || '0');
    const date = new Date(baseDate);
    date.setDate(date.getDate() + (weeks * 7));
    
    return {
      date,
      confidence: 0.9,
      originalText: match[0],
      interpretation: `In ${weeks} week${weeks > 1 ? 's' : ''}`
    };
  }
  
  private handleInMonths(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const months = parseInt(match[1] || '0');
    const date = new Date(baseDate);
    date.setMonth(date.getMonth() + months);
    
    return {
      date,
      confidence: 0.85,
      originalText: match[0],
      interpretation: `In ${months} month${months > 1 ? 's' : ''}`
    };
  }
  
  private handleByWeekday(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const weekday = (match[2] || '').toLowerCase();
    const isNext = match[1] && match[1].toLowerCase().includes('next');
    
    if (isNext) {
      return this.handleNextWeekday(['', weekday], baseDate);
    } else {
      return this.handleThisWeekday(['', weekday], baseDate);
    }
  }
  
  private handleByRelative(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const timeRef = (match[1] || '').toLowerCase();
    
    if (timeRef === 'tomorrow') {
      return this.handleTomorrow(['tomorrow'], baseDate);
    } else if (timeRef === 'next week') {
      return this.handleNextWeek(['next week'], baseDate);
    } else if (timeRef === 'next month') {
      return this.handleNextMonth(['next month'], baseDate);
    }
    
    // Default fallback - return tomorrow
    return this.handleTomorrow(['tomorrow'], baseDate);
  }
  
  private handleByEndOf(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const period = (match[2] || '').toLowerCase();
    const isNext = match[1] && match[1].toLowerCase() === 'next';
    
    const date = new Date(baseDate);
    
    if (period === 'week') {
      // End of week (Sunday)
      const daysToSunday = 7 - date.getDay();
      date.setDate(date.getDate() + daysToSunday);
      if (isNext) {
        date.setDate(date.getDate() + 7);
      }
    } else if (period === 'month') {
      // End of month
      if (isNext) {
        date.setMonth(date.getMonth() + 1);
      }
      date.setMonth(date.getMonth() + 1, 0); // Last day of month
    }
    
    return {
      date,
      confidence: 0.85,
      originalText: match[0],
      interpretation: `By end of ${isNext ? 'next' : 'this'} ${period}`
    };
  }
  
  private handleNumericDate(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const month = parseInt(match[1] || '1') - 1; // Month is 0-indexed
    const day = parseInt(match[2] || '1');
    let year = parseInt(match[3] || new Date().getFullYear().toString());
    
    // Handle 2-digit years
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }
    
    const date = new Date(year, month, day);
    
    return {
      date,
      confidence: 0.95,
      originalText: match[0],
      interpretation: `Specific date: ${match[0]}`
    };
  }
  
  private handleMonthDay(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const monthName = (match[1] || '').toLowerCase();
    const day = parseInt(match[2] || '1');
    const month = this.MONTHS.indexOf(monthName);
    
    const date = new Date(baseDate.getFullYear(), month, day);
    
    // If the date has passed this year, assume next year
    if (date < baseDate) {
      date.setFullYear(date.getFullYear() + 1);
    }
    
    return {
      date,
      confidence: 0.9,
      originalText: match[0],
      interpretation: `${monthName} ${day}`
    };
  }
  
  private handleTimeSpec(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const hour = parseInt(match[1] || '0');
    const minute = parseInt(match[2] || '0');
    const period = match[3]?.toLowerCase();
    
    let adjustedHour = hour;
    if (period === 'pm' && hour < 12) {
      adjustedHour += 12;
    } else if (period === 'am' && hour === 12) {
      adjustedHour = 0;
    }
    
    const date = new Date(baseDate);
    date.setHours(adjustedHour, minute, 0, 0);
    
    return {
      date,
      confidence: 0.9,
      originalText: match[0],
      interpretation: `Time: ${hour}:${minute.toString().padStart(2, '0')} ${period || ''}`
    };
  }
  
  private handleSimpleTime(match: RegExpMatchArray, baseDate: Date): ResolvedDate {
    const hour = parseInt(match[1] || '0');
    const period = match[2]?.toLowerCase();
    
    let adjustedHour = hour;
    if (period === 'pm' && hour < 12) {
      adjustedHour += 12;
    } else if (period === 'am' && hour === 12) {
      adjustedHour = 0;
    }
    
    const date = new Date(baseDate);
    date.setHours(adjustedHour, 0, 0, 0);
    
    return {
      date,
      confidence: 0.85,
      originalText: match[0],
      interpretation: `Time: ${hour} ${period || ''}`
    };
  }
  
  private parseNaturalLanguageDate(text: string, baseDate: Date): ResolvedDate | null {
    // Simple fallback parsing for common phrases
    const phrases = {
      'end of week': () => {
        const date = new Date(baseDate);
        const daysToSunday = 7 - date.getDay();
        date.setDate(date.getDate() + daysToSunday);
        return date;
      },
      'start of week': () => {
        const date = new Date(baseDate);
        const daysToMonday = date.getDay() === 0 ? 1 : (8 - date.getDay());
        date.setDate(date.getDate() + daysToMonday);
        return date;
      },
      'end of day': () => {
        const date = new Date(baseDate);
        date.setHours(23, 59, 59, 999);
        return date;
      }
    };
    
    for (const [phrase, dateCalculator] of Object.entries(phrases)) {
      if (text.includes(phrase)) {
        return {
          date: dateCalculator(),
          confidence: 0.7,
          originalText: phrase,
          interpretation: phrase
        };
      }
    }
    
    return null;
  }
}