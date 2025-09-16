/**
 * Database layer exports
 * Centralized access to all repositories and database utilities
 */
export { default as BaseRepository } from './BaseRepository';
export type { BaseEntity, FilterOptions, PaginatedResult } from './BaseRepository';
export { default as UserRepository } from './UserRepository';
export type { User, CreateUserData, UpdateUserData, UserStats } from './UserRepository';
export { default as ChannelRepository } from './ChannelRepository';
export type { Channel, CreateChannelData, ChannelWithDetails } from './ChannelRepository';
export { default as TaskRepository } from './TaskRepository';
export type { Task, CreateTaskData, TaskWithDetails, TaskFilter } from './TaskRepository';
export { default as MessageRepository } from './MessageRepository';
export type { Message, CreateMessageData, MessageWithUser } from './MessageRepository';
export { default as ActivityRepository } from './ActivityRepository';
export type { Activity, CreateActivityData, ActivityWithUser } from './ActivityRepository';
export { default as FileRepository } from './FileRepository';
export type { FileEntity, CreateFileData, FileWithUploader } from './FileRepository';
export { default as AnnouncementRepository } from './AnnouncementRepository';
export type { Announcement, CreateAnnouncementData, UpdateAnnouncementData, AnnouncementFilter } from './AnnouncementRepository';
export { CommentRepository } from './CommentRepository';
export type { TaskComment, CreateCommentData, UpdateCommentData, CommentFilterOptions } from './CommentRepository';
import UserRepository from './UserRepository';
import ChannelRepository from './ChannelRepository';
import TaskRepository from './TaskRepository';
import MessageRepository from './MessageRepository';
import ActivityRepository from './ActivityRepository';
import FileRepository from './FileRepository';
import AnnouncementRepository from './AnnouncementRepository';
import { CommentRepository } from './CommentRepository';
export declare const userRepository: UserRepository;
export declare const channelRepository: ChannelRepository;
export declare const taskRepository: TaskRepository;
export declare const messageRepository: MessageRepository;
export declare const activityRepository: ActivityRepository;
export declare const fileRepository: FileRepository;
export declare const announcementRepository: AnnouncementRepository;
export declare const commentRepository: CommentRepository;
export declare const repositories: {
    readonly users: UserRepository;
    readonly channels: ChannelRepository;
    readonly tasks: TaskRepository;
    readonly messages: MessageRepository;
    readonly activities: ActivityRepository;
    readonly files: FileRepository;
    readonly announcements: AnnouncementRepository;
    readonly comments: CommentRepository;
};
export type Repositories = typeof repositories;
export { initializeDatabase, closeDatabase, getPool, query, transaction, healthCheck, getPoolStats, databaseMetrics } from '../config/database';
export declare class DatabaseManager {
    private static instance;
    static getInstance(): DatabaseManager;
    query(text: string, params?: any[], client?: any): Promise<any>;
    one(text: string, params?: any[], client?: any): Promise<any>;
    many(text: string, params?: any[], client?: any): Promise<any[]>;
    none(text: string, params?: any[], client?: any): Promise<void>;
    transaction<T>(callback: (client: any) => Promise<T>): Promise<T>;
}
export { runMigrations, rollbackLastMigration, getMigrationStatus, validateMigrations } from './migrator';
export default repositories;
//# sourceMappingURL=index.d.ts.map