import { DatabaseClient } from '@config/database';
import { BaseRepository, BaseEntity } from './BaseRepository';
export interface Announcement extends BaseEntity {
    id: string;
    title: string;
    content: string;
    type: 'info' | 'warning' | 'success' | 'error' | 'feature' | 'maintenance';
    priority: 'low' | 'medium' | 'high' | 'critical';
    target_audience: 'all' | 'admins' | 'developers' | 'designers' | 'managers';
    scheduled_for?: Date | null;
    expires_at?: Date | null;
    action_button_text?: string | null;
    action_button_url?: string | null;
    image_url?: string | null;
    created_by: string;
    published: boolean;
    read_by: string[];
}
export interface CreateAnnouncementData {
    title: string;
    content: string;
    type: Announcement['type'];
    priority: Announcement['priority'];
    target_audience: Announcement['target_audience'];
    scheduled_for?: Date | undefined;
    expires_at?: Date | undefined;
    action_button_text?: string | undefined;
    action_button_url?: string | undefined;
    image_url?: string | undefined;
    created_by: string;
    published?: boolean | undefined;
}
export interface UpdateAnnouncementData {
    title?: string | undefined;
    content?: string | undefined;
    type?: Announcement['type'] | undefined;
    priority?: Announcement['priority'] | undefined;
    target_audience?: Announcement['target_audience'] | undefined;
    scheduled_for?: Date | null | undefined;
    expires_at?: Date | null | undefined;
    action_button_text?: string | null | undefined;
    action_button_url?: string | null | undefined;
    image_url?: string | null | undefined;
    published?: boolean | undefined;
}
export interface AnnouncementFilter {
    type?: Announcement['type'][] | undefined;
    priority?: Announcement['priority'][] | undefined;
    target_audience?: Announcement['target_audience'][] | undefined;
    published?: boolean | undefined;
    created_by?: string[] | undefined;
    date_from?: Date | undefined;
    date_to?: Date | undefined;
}
export default class AnnouncementRepository extends BaseRepository<Announcement> {
    constructor();
    create(data: CreateAnnouncementData, client?: DatabaseClient): Promise<Announcement>;
    update(id: string, data: UpdateAnnouncementData, client?: DatabaseClient): Promise<Announcement>;
    findForUser(userId: string, userRole: string, includeRead?: boolean, client?: DatabaseClient): Promise<Announcement[]>;
    markAsRead(announcementId: string, userId: string, client?: DatabaseClient): Promise<void>;
    findWithFilter(filter: AnnouncementFilter, limit?: number, offset?: number, client?: DatabaseClient): Promise<{
        data: Announcement[];
        total: number;
    }>;
    getStats(client?: DatabaseClient): Promise<{
        total: number;
        published: number;
        scheduled: number;
        expired: number;
        byType: Record<string, number>;
        byPriority: Record<string, number>;
        byAudience: Record<string, number>;
    }>;
    private mapRoleToAudience;
    private transformRow;
}
//# sourceMappingURL=AnnouncementRepository.d.ts.map