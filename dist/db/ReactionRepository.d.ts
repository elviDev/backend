import { DatabaseClient } from '@config/database';
import BaseRepository, { BaseEntity } from './BaseRepository';
export interface MessageReaction extends BaseEntity {
    message_id: string;
    user_id: string;
    emoji: string;
}
export interface ReactionSummary {
    emoji: string;
    count: number;
    users: Array<{
        id: string;
        name: string;
        avatar_url?: string;
    }>;
}
export interface MessageReactionDetails extends MessageReaction {
    user_details: {
        id: string;
        name: string;
        email: string;
        avatar_url?: string;
        role: string;
    };
}
declare class ReactionRepository extends BaseRepository<MessageReaction> {
    constructor();
    /**
     * Add or toggle a reaction on a message
     */
    toggleReaction(messageId: string, userId: string, emoji: string, client?: DatabaseClient): Promise<{
        action: 'added' | 'removed';
        reaction?: MessageReaction;
    }>;
    /**
     * Get all reactions for a message grouped by emoji
     */
    getMessageReactions(messageId: string, client?: DatabaseClient): Promise<ReactionSummary[]>;
    /**
     * Get all reactions for a message with full user details
     */
    getMessageReactionDetails(messageId: string, client?: DatabaseClient): Promise<MessageReactionDetails[]>;
    /**
     * Get reactions by a specific user
     */
    getUserReactions(userId: string, messageIds?: string[], client?: DatabaseClient): Promise<MessageReactionDetails[]>;
    /**
     * Get most popular reactions across messages
     */
    getPopularReactions(channelId?: string, limit?: number, client?: DatabaseClient): Promise<Array<{
        emoji: string;
        count: number;
        usage_percentage: number;
    }>>;
    /**
     * Remove all reactions from a message
     */
    removeAllMessageReactions(messageId: string, deletedBy: string, client?: DatabaseClient): Promise<number>;
    /**
     * Remove all reactions by a user
     */
    removeAllUserReactions(userId: string, messageId?: string, client?: DatabaseClient): Promise<number>;
    /**
     * Get reaction statistics for a channel
     */
    getChannelReactionStats(channelId: string, client?: DatabaseClient): Promise<{
        total_reactions: number;
        unique_emojis: number;
        most_used_emoji: string | null;
        top_reactors: Array<{
            user_id: string;
            user_name: string;
            reaction_count: number;
        }>;
    }>;
    /**
     * Check if user has reacted to a message with specific emoji
     */
    hasUserReacted(messageId: string, userId: string, emoji?: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Find a specific reaction by message, user, and emoji
     */
    findReaction(messageId: string, userId: string, emoji: string, client?: DatabaseClient): Promise<MessageReaction | null>;
    /**
     * Get recent reactions across all messages for activity feed
     */
    getRecentReactions(channelId?: string, limit?: number, client?: DatabaseClient): Promise<Array<{
        reaction: MessageReactionDetails;
        message: {
            id: string;
            content: string;
            channel_id: string;
        };
    }>>;
}
export default ReactionRepository;
//# sourceMappingURL=ReactionRepository.d.ts.map