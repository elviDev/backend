import { DatabaseClient } from '@config/database';
import BaseRepository, { BaseEntity } from './BaseRepository';
export interface ThreadStatistics extends BaseEntity {
    thread_root_id: string;
    reply_count: number;
    participant_count: number;
    last_reply_at?: Date;
    last_reply_by_id?: string;
    participants: string[];
}
export interface ThreadWithDetails extends ThreadStatistics {
    thread_root: {
        id: string;
        content: string;
        user_details: {
            id: string;
            name: string;
            email: string;
            avatar_url?: string;
            role: string;
            phone?: string;
        };
        created_at: Date;
        reactions: Array<{
            emoji: string;
            count: number;
            users: Array<{
                id: string;
                name: string;
                avatar_url?: string;
            }>;
        }>;
    };
    participant_details: Array<{
        id: string;
        name: string;
        email: string;
        avatar_url?: string;
        role: string;
    }>;
    last_reply_by_details?: {
        id: string;
        name: string;
        avatar_url?: string;
    };
}
export interface ThreadReply {
    id: string;
    content: string;
    user_id: string;
    user_details: {
        id: string;
        name: string;
        email: string;
        avatar_url?: string;
        role: string;
        phone?: string;
    };
    thread_root_id: string;
    reply_to_id?: string;
    message_type: string;
    attachments: any[];
    reactions: Array<{
        emoji: string;
        count: number;
        users: Array<{
            id: string;
            name: string;
            avatar_url?: string;
        }>;
    }>;
    is_edited: boolean;
    edited_at?: Date;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;
}
declare class ThreadRepository extends BaseRepository<ThreadStatistics> {
    constructor();
    /**
     * Create a new thread on a message
     */
    createThread(messageId: string, createdBy: string, client?: DatabaseClient): Promise<ThreadStatistics>;
    /**
     * Get thread statistics by thread root ID
     */
    getThreadStatistics(threadRootId: string, client?: DatabaseClient): Promise<ThreadStatistics>;
    /**
     * Get thread with full details including root message and participants
     */
    getThreadWithDetails(threadRootId: string, client?: DatabaseClient): Promise<ThreadWithDetails>;
    /**
     * Get thread replies with pagination
     */
    getThreadReplies(threadRootId: string, limit?: number, offset?: number, client?: DatabaseClient): Promise<{
        replies: ThreadReply[];
        total: number;
    }>;
    /**
     * Add a reply to a thread
     */
    addThreadReply(threadRootId: string, replyData: {
        content: string;
        user_id: string;
        message_type?: string;
        attachments?: any[];
        reply_to_id?: string;
    }, client?: DatabaseClient): Promise<ThreadReply>;
    /**
     * Delete a thread (mark thread root and all replies as deleted)
     */
    deleteThread(threadRootId: string, deletedBy: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Get threads in a channel with pagination
     */
    getChannelThreads(channelId: string, limit?: number, offset?: number, client?: DatabaseClient): Promise<{
        threads: ThreadWithDetails[];
        total: number;
    }>;
}
export default ThreadRepository;
//# sourceMappingURL=ThreadRepository.d.ts.map