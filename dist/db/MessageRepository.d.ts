import { DatabaseClient } from '@config/database';
import BaseRepository, { BaseEntity } from './BaseRepository';
export interface Message extends BaseEntity {
    channel_id: string;
    task_id?: string;
    user_id: string;
    content: string;
    message_type: 'text' | 'voice' | 'file' | 'system' | 'command_result' | 'ai_response';
    voice_data?: Record<string, any>;
    transcription?: string;
    attachments: any[];
    reply_to_id?: string;
    thread_root_id?: string;
    is_thread_root: boolean;
    is_edited: boolean;
    is_pinned: boolean;
    is_announcement: boolean;
    reactions: Record<string, any>;
    mentions: string[];
    ai_generated: boolean;
    ai_context?: Record<string, any>;
    command_execution_id?: string;
    metadata: Record<string, any>;
    formatting: Record<string, any>;
    edited_at?: Date;
}
export interface CreateMessageData {
    channel_id: string;
    task_id?: string;
    user_id: string;
    content: string;
    message_type?: Message['message_type'];
    voice_data?: Record<string, any>;
    transcription?: string;
    attachments?: any[];
    reply_to_id?: string;
    thread_root_id?: string;
    mentions?: string[];
    ai_generated?: boolean;
    ai_context?: Record<string, any>;
    command_execution_id?: string;
    metadata?: Record<string, any>;
    formatting?: Record<string, any>;
}
export interface MessageWithUser extends Message {
    user_details: {
        id: string;
        name: string;
        email: string;
        avatar_url?: string;
        role: string;
        phone?: string;
    };
    reply_to?: {
        id: string;
        content: string;
        user: {
            id: string;
            name: string;
            avatar_url?: string;
        };
    };
    thread_info?: {
        reply_count: number;
        participant_count: number;
        last_reply_at?: Date;
        last_reply_by?: {
            id: string;
            name: string;
            avatar_url?: string;
        };
        participants: Array<{
            id: string;
            name: string;
            avatar_url?: string;
        }>;
    };
    reactions: Array<{
        emoji: string;
        count: number;
        users: Array<{
            id: string;
            name: string;
            avatar_url?: string;
        }>;
    }>;
    reply_count?: number;
    last_reply_timestamp?: Date;
    deleted_by_name?: string;
}
declare class MessageRepository extends BaseRepository<Message> {
    constructor();
    /**
     * Create new message with validation
     */
    createMessage(messageData: CreateMessageData, client?: DatabaseClient): Promise<Message>;
    /**
     * Find messages in a channel
     */
    findChannelMessages(channelId: string, filters?: {
        threadRootId?: string;
        messageType?: string;
        before?: Date;
        after?: Date;
        includeThreadReplies?: boolean;
    }, limit?: number, offset?: number, client?: DatabaseClient): Promise<MessageWithUser[]>;
    /**
     * Get channel message count
     */
    getChannelMessageCount(channelId: string, filters?: {
        threadRootId?: string;
        messageType?: string;
        before?: Date;
        after?: Date;
        includeThreadReplies?: boolean;
    }, client?: DatabaseClient): Promise<number>;
    /**
     * Find message by ID with user details
     */
    findByIdWithUser(messageId: string, client?: DatabaseClient): Promise<MessageWithUser | null>;
    /**
     * Search messages in channel
     */
    searchMessages(channelId: string, searchTerm: string, limit?: number, offset?: number, client?: DatabaseClient): Promise<MessageWithUser[]>;
    /**
     * Update message content
     */
    updateMessage(messageId: string, updateData: Partial<Message>, client?: DatabaseClient): Promise<Message>;
    /**
     * Add reaction to message
     */
    addReaction(messageId: string, userId: string, emoji: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Remove reaction from message
     */
    removeReaction(messageId: string, userId: string, emoji: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Get message reactions
     */
    getMessageReactions(messageId: string, client?: DatabaseClient): Promise<Record<string, string[]>>;
    /**
     * Update user's last read message in channel
     */
    updateLastRead(channelId: string, userId: string, messageId?: string, client?: DatabaseClient): Promise<void>;
    /**
     * Get latest message ID in channel
     */
    private getLatestMessageId;
    /**
     * Get unread message count for user in channel
     */
    getUnreadCount(channelId: string, userId: string, client?: DatabaseClient): Promise<number>;
    /**
     * Get message thread
     */
    getMessageThread(threadRootId: string, limit?: number, offset?: number, client?: DatabaseClient): Promise<MessageWithUser[]>;
    /**
     * Get pinned messages in channel
     */
    getPinnedMessages(channelId: string, limit?: number, client?: DatabaseClient): Promise<MessageWithUser[]>;
    /**
     * Get channel message statistics
     */
    getChannelMessageStats(channelId: string, client?: DatabaseClient): Promise<{
        totalMessages: number;
        messagesByType: Record<string, number>;
        topUsers: Array<{
            userId: string;
            userName: string;
            messageCount: number;
        }>;
        dailyActivity: Array<{
            date: string;
            messageCount: number;
        }>;
    }>;
}
export default MessageRepository;
//# sourceMappingURL=MessageRepository.d.ts.map