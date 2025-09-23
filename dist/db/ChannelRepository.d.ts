import { DatabaseClient } from '@config/database';
import BaseRepository, { BaseEntity } from './BaseRepository';
export interface Channel extends BaseEntity {
    name: string;
    description?: string;
    category_id?: string;
    channel_type: 'project' | 'department' | 'initiative' | 'temporary' | 'emergency' | 'announcement';
    privacy_level: 'public' | 'private' | 'restricted';
    status: 'active' | 'archived' | 'paused' | 'completed';
    created_by: string;
    owned_by: string;
    moderators: string[];
    members: string[];
    member_count: number;
    max_members: number;
    auto_join_roles: string[];
    settings: Record<string, any>;
    integrations: Record<string, any>;
    activity_stats: Record<string, any>;
    project_info: Record<string, any>;
    schedule: Record<string, any>;
    archived_at?: Date;
    archived_by?: string;
    archive_reason?: string;
    retention_until?: Date;
    last_activity_at: Date;
}
export interface CreateChannelData {
    name: string;
    description?: string;
    category_id?: string;
    channel_type?: Channel['channel_type'];
    privacy_level?: Channel['privacy_level'];
    created_by: string;
    owned_by?: string;
    members?: string[];
    moderators?: string[];
    max_members?: number;
    auto_join_roles?: string[];
    settings?: Record<string, any>;
    project_info?: Record<string, any>;
    integrations?: Record<string, any>;
}
export interface ChannelWithDetails extends Channel {
    category_name?: string;
    owner_name?: string;
    member_details?: Array<{
        id: string;
        name: string;
        email: string;
        role: string;
        avatar_url?: string;
    }>;
    tasks?: Array<{
        id: string;
        title: string;
        status: string;
        priority: string;
        assignee_details?: Array<{
            id: string;
            name: string;
            email: string;
            avatar_url?: string;
            role: string;
            phone?: string;
        }>;
    }>;
}
declare class ChannelRepository extends BaseRepository<Channel> {
    constructor();
    /**
     * Create new channel with validation
     */
    createChannel(channelData: CreateChannelData, client?: DatabaseClient): Promise<Channel>;
    /**
     * Find channel by category and name
     */
    findByCategoryAndName(categoryId: string, name: string, client?: DatabaseClient): Promise<Channel | null>;
    /**
     * Find channels by category
     */
    findByCategory(categoryId: string, includeDeleted?: boolean, client?: DatabaseClient): Promise<Channel[]>;
    /**
     * Find channels where user is a member
     */
    findByMember(userId: string, includeDeleted?: boolean, client?: DatabaseClient): Promise<Channel[]>;
    /**
     * Find channels accessible by user (considering role and privacy)
     */
    findAccessibleByUser(userId: string, userRole: string, client?: DatabaseClient): Promise<Channel[]>;
    /**
     * Add member to channel
     */
    addMember(channelId: string, userId: string, addedBy: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Remove member from channel
     */
    removeMember(channelId: string, userId: string, removedBy: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Add multiple members to channel
     */
    addMembers(channelId: string, userIds: string[], addedBy: string, client?: DatabaseClient): Promise<string[]>;
    /**
     * Get channel with detailed member information
     */
    findWithMembers(channelId: string, client?: DatabaseClient): Promise<ChannelWithDetails | null>;
    /**
     * Get channel with detailed member information and tasks with assignee details
     */
    findWithFullDetails(channelId: string, client?: DatabaseClient): Promise<ChannelWithDetails | null>;
    /**
     * Find channels accessible by user with full details (members and tasks)
     */
    findAccessibleByUserWithDetails(userId: string, userRole: string, client?: DatabaseClient): Promise<ChannelWithDetails[]>;
    /**
     * Search channels by name or description
     */
    searchChannels(searchTerm: string, userId?: string, userRole?: string, limit?: number, offset?: number, client?: DatabaseClient): Promise<Channel[]>;
    /**
     * Get channels by status
     */
    findByStatus(status: Channel['status'], limit?: number, client?: DatabaseClient): Promise<Channel[]>;
    /**
     * Archive channel
     */
    archiveChannel(channelId: string, archivedBy: string, reason?: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Restore archived channel
     */
    restoreChannel(channelId: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Update channel activity timestamp
     */
    updateActivity(channelId: string, client?: DatabaseClient): Promise<void>;
    /**
     * Get channels requiring attention (no recent activity)
     */
    getInactiveChannels(daysSinceActivity?: number, client?: DatabaseClient): Promise<Channel[]>;
    /**
     * Get channel statistics
     */
    getChannelStats(client?: DatabaseClient): Promise<{
        totalChannels: number;
        activeChannels: number;
        channelsByType: Record<string, number>;
        channelsByPrivacy: Record<string, number>;
        averageMembers: number;
        mostActiveChannels: Array<{
            id: string;
            name: string;
            activity_count: number;
        }>;
    }>;
    /**
     * Find channels for a specific user based on their role and permissions
     */
    findUserChannels(userId: string, userRole?: string, client?: DatabaseClient): Promise<Channel[]>;
    /**
     * Get channel members
     */
    getMembers(channelId: string, client?: DatabaseClient): Promise<any[]>;
    /**
     * Check if user can access channel
     */
    canUserAccess(channelId: string, userId: string, userRole: string, client?: DatabaseClient): Promise<boolean>;
}
export default ChannelRepository;
//# sourceMappingURL=ChannelRepository.d.ts.map