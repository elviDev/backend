"use strict";
/**
 * Entity Resolver - Phase 2 AI Intelligence
 * Smart entity resolution with fuzzy matching and context awareness
 *
 * Success Criteria:
 * - Fuzzy matching with 85%+ accuracy
 * - Handles pronouns (this, that, it)
 * - Context-aware disambiguation
 * - <200ms resolution time per entity
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityResolver = void 0;
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../../utils/logger");
class EntityResolver {
    db;
    performanceMetrics = [];
    // Simple fuzzy matching cache
    fuzzyCache = new Map();
    constructor(db) {
        this.db = db;
        logger_1.logger.debug('Entity Resolver initialized');
    }
    /**
     * Resolve user entity with fuzzy matching and context
     * Target: <200ms resolution time
     */
    async resolveUser(name, context) {
        const startTime = perf_hooks_1.performance.now();
        try {
            // Exact match first (highest confidence)
            let user = await this.findUserExactMatch(name, context);
            if (user) {
                const resolutionTime = perf_hooks_1.performance.now() - startTime;
                this.recordPerformance(resolutionTime);
                return { ...user, confidence: 1.0 };
            }
            // Try fuzzy matching on team members
            user = await this.findUserFuzzyMatch(name, context);
            if (user) {
                const resolutionTime = perf_hooks_1.performance.now() - startTime;
                this.recordPerformance(resolutionTime);
                return user;
            }
            // Try role-based resolution
            user = await this.resolveUserByRole(name, context);
            if (user) {
                const resolutionTime = perf_hooks_1.performance.now() - startTime;
                this.recordPerformance(resolutionTime);
                return user;
            }
            const resolutionTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(resolutionTime);
            logger_1.logger.debug('User resolution failed', {
                name,
                resolutionTime: `${resolutionTime.toFixed(2)}ms`
            });
            return null;
        }
        catch (error) {
            const resolutionTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(resolutionTime);
            logger_1.logger.error('User resolution error', {
                name,
                error: error.message,
                resolutionTime: `${resolutionTime.toFixed(2)}ms`
            });
            return null;
        }
    }
    /**
     * Resolve channel entity with context awareness
     */
    async resolveChannel(name, context) {
        const startTime = perf_hooks_1.performance.now();
        try {
            // Exact match within user's active channels
            let channel = this.findChannelExactMatch(name, context);
            if (channel) {
                const resolutionTime = perf_hooks_1.performance.now() - startTime;
                this.recordPerformance(resolutionTime);
                return { ...channel, confidence: 1.0 };
            }
            // Fuzzy match within user's channels
            channel = this.findChannelFuzzyMatch(name, context);
            if (channel) {
                const resolutionTime = perf_hooks_1.performance.now() - startTime;
                this.recordPerformance(resolutionTime);
                return channel;
            }
            // Search all accessible channels
            channel = await this.findChannelInDatabase(name, context);
            if (channel) {
                const resolutionTime = perf_hooks_1.performance.now() - startTime;
                this.recordPerformance(resolutionTime);
                return channel;
            }
            const resolutionTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(resolutionTime);
            logger_1.logger.debug('Channel resolution failed', {
                name,
                resolutionTime: `${resolutionTime.toFixed(2)}ms`
            });
            return null;
        }
        catch (error) {
            const resolutionTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(resolutionTime);
            logger_1.logger.error('Channel resolution error', {
                name,
                error: error.message,
                resolutionTime: `${resolutionTime.toFixed(2)}ms`
            });
            return null;
        }
    }
    /**
     * Resolve task entity with smart matching
     */
    async resolveTask(reference, context) {
        const startTime = perf_hooks_1.performance.now();
        try {
            // Try exact title match
            let task = this.findTaskExactMatch(reference, context);
            if (task) {
                const resolutionTime = perf_hooks_1.performance.now() - startTime;
                this.recordPerformance(resolutionTime);
                return { ...task, confidence: 1.0 };
            }
            // Try fuzzy title match
            task = this.findTaskFuzzyMatch(reference, context);
            if (task) {
                const resolutionTime = perf_hooks_1.performance.now() - startTime;
                this.recordPerformance(resolutionTime);
                return task;
            }
            // Try contextual resolution (e.g., "this task", "the current task")
            task = await this.resolveTaskContextually(reference, context);
            if (task) {
                const resolutionTime = perf_hooks_1.performance.now() - startTime;
                this.recordPerformance(resolutionTime);
                return task;
            }
            const resolutionTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(resolutionTime);
            return null;
        }
        catch (error) {
            const resolutionTime = perf_hooks_1.performance.now() - startTime;
            this.recordPerformance(resolutionTime);
            logger_1.logger.error('Task resolution error', {
                reference,
                error: error.message,
                resolutionTime: `${resolutionTime.toFixed(2)}ms`
            });
            return null;
        }
    }
    /**
     * Validate and enhance entities from AI parsing
     */
    async validateAndEnhanceEntities(entities, context) {
        const enhanced = {
            users: [],
            channels: [],
            tasks: [],
            dates: [],
            files: []
        };
        // Validate and enhance user entities
        if (entities.users && Array.isArray(entities.users)) {
            for (const user of entities.users) {
                const resolved = await this.resolveUser(user.name, context);
                if (resolved) {
                    enhanced.users.push({
                        name: user.name,
                        resolved_id: resolved.id,
                        confidence: Math.min(user.confidence, resolved.confidence)
                    });
                }
            }
        }
        // Validate and enhance channel entities
        if (entities.channels && Array.isArray(entities.channels)) {
            for (const channel of entities.channels) {
                const resolved = await this.resolveChannel(channel.name, context);
                if (resolved) {
                    enhanced.channels.push({
                        name: channel.name,
                        resolved_id: resolved.id,
                        confidence: Math.min(channel.confidence, resolved.confidence)
                    });
                }
            }
        }
        // Validate and enhance task entities
        if (entities.tasks && Array.isArray(entities.tasks)) {
            for (const task of entities.tasks) {
                const resolved = await this.resolveTask(task.title, context);
                if (resolved) {
                    enhanced.tasks.push({
                        title: task.title,
                        resolved_id: resolved.id,
                        confidence: Math.min(task.confidence, resolved.confidence)
                    });
                }
            }
        }
        // Pass through date entities (handled by TemporalProcessor)
        if (entities.dates && Array.isArray(entities.dates)) {
            enhanced.dates = entities.dates;
        }
        // Pass through file entities
        if (entities.files && Array.isArray(entities.files)) {
            enhanced.files = entities.files;
        }
        return enhanced;
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
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        return {
            average: Math.round(average * 100) / 100,
            p95: Math.round((p95 || 0) * 100) / 100,
            p99: Math.round((p99 || 0) * 100) / 100,
            count: this.performanceMetrics.length
        };
    }
    async findUserExactMatch(name, context) {
        // Check team members first (most common case)
        const exactMatch = context.teamMembers.find(member => member.name.toLowerCase() === name.toLowerCase());
        if (exactMatch) {
            return {
                id: exactMatch.id,
                name: exactMatch.name,
                role: exactMatch.role,
                email: '', // Would be filled from database if needed
                confidence: 1.0
            };
        }
        return null;
    }
    async findUserFuzzyMatch(name, context) {
        const matches = this.fuzzyMatchUsers(name, context.teamMembers);
        if (matches.length > 0 && matches[0]?.score && matches[0].score > 0.7) {
            const match = matches[0];
            if (match) {
                return {
                    id: match.user.id,
                    name: match.user.name,
                    role: match.user.role,
                    email: '',
                    confidence: match.score
                };
            }
        }
        return null;
    }
    async resolveUserByRole(name, context) {
        // Handle role-based references like "the manager", "marketing team lead"
        const roleKeywords = {
            'manager': ['manager', 'lead', 'supervisor'],
            'developer': ['developer', 'engineer', 'programmer'],
            'designer': ['designer', 'creative'],
            'marketing': ['marketing', 'marketer'],
            'sales': ['sales', 'salesperson']
        };
        const nameLower = name.toLowerCase();
        for (const [role, keywords] of Object.entries(roleKeywords)) {
            if (keywords.some(keyword => nameLower.includes(keyword))) {
                const roleMatch = context.teamMembers.find(member => member.role.toLowerCase().includes(role));
                if (roleMatch) {
                    return {
                        id: roleMatch.id,
                        name: roleMatch.name,
                        role: roleMatch.role,
                        email: '',
                        confidence: 0.8 // Lower confidence for role-based matches
                    };
                }
            }
        }
        return null;
    }
    findChannelExactMatch(name, context) {
        const exactMatch = context.activeChannels.find(channel => channel.name.toLowerCase() === name.toLowerCase());
        if (exactMatch) {
            return {
                id: exactMatch.id,
                name: exactMatch.name,
                type: exactMatch.type,
                memberCount: exactMatch.memberCount,
                confidence: 1.0
            };
        }
        return null;
    }
    findChannelFuzzyMatch(name, context) {
        const matches = this.fuzzyMatchChannels(name, context.activeChannels);
        if (matches.length > 0 && matches[0]?.score && matches[0].score > 0.7) {
            const match = matches[0];
            if (match) {
                return {
                    id: match.channel.id,
                    name: match.channel.name,
                    type: match.channel.type,
                    memberCount: match.channel.memberCount,
                    confidence: match.score
                };
            }
        }
        return null;
    }
    async findChannelInDatabase(name, context) {
        try {
            const result = await this.db.query(`
        SELECT c.id, c.name, c.channel_type as type,
               COUNT(cm.user_id) as member_count
        FROM channels c
        LEFT JOIN channel_members cm ON c.id = cm.channel_id
        WHERE c.name ILIKE $1 
          AND c.status = 'active'
          AND (c.privacy_level = 'public' 
               OR c.id IN (
                 SELECT channel_id 
                 FROM channel_members 
                 WHERE user_id = $2
               ))
        GROUP BY c.id, c.name, c.channel_type
        LIMIT 5
      `, [`%${name}%`, context.user.id]);
            if (result.rows.length > 0) {
                const channel = result.rows[0];
                return {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    memberCount: parseInt(channel.member_count) || 0,
                    confidence: 0.6 // Lower confidence for database searches
                };
            }
        }
        catch (error) {
            logger_1.logger.error('Database channel search failed', {
                name,
                error: error.message
            });
        }
        return null;
    }
    findTaskExactMatch(reference, context) {
        const exactMatch = context.recentTasks.find(task => task.title.toLowerCase() === reference.toLowerCase());
        if (exactMatch) {
            return {
                id: exactMatch.id,
                title: exactMatch.title,
                status: exactMatch.status,
                assignedTo: exactMatch.assignedTo,
                confidence: 1.0
            };
        }
        return null;
    }
    findTaskFuzzyMatch(reference, context) {
        const matches = this.fuzzyMatchTasks(reference, context.recentTasks);
        if (matches.length > 0 && matches[0]?.score && matches[0].score > 0.7) {
            const match = matches[0];
            if (match) {
                return {
                    id: match.task.id,
                    title: match.task.title,
                    status: match.task.status,
                    assignedTo: match.task.assignedTo,
                    confidence: match.score
                };
            }
        }
        return null;
    }
    async resolveTaskContextually(reference, context) {
        const refLower = reference.toLowerCase();
        // Handle contextual references
        if (refLower.includes('this task') || refLower.includes('current task')) {
            // Return most recent task
            const recentTask = context.recentTasks[0];
            if (recentTask) {
                return {
                    id: recentTask.id,
                    title: recentTask.title,
                    status: recentTask.status,
                    assignedTo: recentTask.assignedTo,
                    confidence: 0.8
                };
            }
        }
        if (refLower.includes('urgent') || refLower.includes('priority')) {
            // Find urgent tasks
            const urgentTask = context.recentTasks.find(task => task.dueDate && new Date(task.dueDate) <= new Date(Date.now() + 86400000) // Due within 24 hours
            );
            if (urgentTask) {
                return {
                    id: urgentTask.id,
                    title: urgentTask.title,
                    status: urgentTask.status,
                    assignedTo: urgentTask.assignedTo,
                    confidence: 0.7
                };
            }
        }
        return null;
    }
    // Simple fuzzy matching implementation
    fuzzyMatchUsers(query, users) {
        return users
            .map(user => ({
            user,
            score: this.calculateSimilarity(query.toLowerCase(), user.name.toLowerCase())
        }))
            .filter(match => match.score > 0.5)
            .sort((a, b) => b.score - a.score);
    }
    fuzzyMatchChannels(query, channels) {
        return channels
            .map(channel => ({
            channel,
            score: this.calculateSimilarity(query.toLowerCase(), channel.name.toLowerCase())
        }))
            .filter(match => match.score > 0.5)
            .sort((a, b) => b.score - a.score);
    }
    fuzzyMatchTasks(query, tasks) {
        return tasks
            .map(task => ({
            task,
            score: this.calculateSimilarity(query.toLowerCase(), task.title.toLowerCase())
        }))
            .filter(match => match.score > 0.5)
            .sort((a, b) => b.score - a.score);
    }
    // Simple similarity calculation (Jaccard similarity)
    calculateSimilarity(str1, str2) {
        if (str1 === str2)
            return 1.0;
        const words1 = new Set(str1.split(/\s+/));
        const words2 = new Set(str2.split(/\s+/));
        const intersection = new Set([...words1].filter(word => words2.has(word)));
        const union = new Set([...words1, ...words2]);
        if (union.size === 0)
            return 0;
        const jaccardSimilarity = intersection.size / union.size;
        // Boost for substring matches
        const substringBoost = str2.includes(str1) || str1.includes(str2) ? 0.3 : 0;
        return Math.min(1.0, jaccardSimilarity + substringBoost);
    }
    recordPerformance(time) {
        this.performanceMetrics.push(time);
        // Keep only last 1000 measurements
        if (this.performanceMetrics.length > 1000) {
            this.performanceMetrics.shift();
        }
    }
}
exports.EntityResolver = EntityResolver;
//# sourceMappingURL=EntityResolver.js.map