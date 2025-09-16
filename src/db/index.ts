/**
 * Database layer exports
 * Centralized access to all repositories and database utilities
 */

// Base repository
export { default as BaseRepository } from './BaseRepository';
export type { BaseEntity, FilterOptions, PaginatedResult } from './BaseRepository';

// Specialized repositories
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

// Repository instances for dependency injection
import UserRepository from './UserRepository';
import ChannelRepository from './ChannelRepository';
import TaskRepository from './TaskRepository';
import MessageRepository from './MessageRepository';
import ActivityRepository from './ActivityRepository';
import FileRepository from './FileRepository';
import AnnouncementRepository from './AnnouncementRepository';
import { CommentRepository } from './CommentRepository';

// Create singleton instances
export const userRepository = new UserRepository();
export const channelRepository = new ChannelRepository();
export const taskRepository = new TaskRepository();
export const messageRepository = new MessageRepository();
export const activityRepository = new ActivityRepository();
export const fileRepository = new FileRepository();
export const announcementRepository = new AnnouncementRepository();
export const commentRepository = new CommentRepository();

// Repository collection for easy access
export const repositories = {
  users: userRepository,
  channels: channelRepository,
  tasks: taskRepository,
  messages: messageRepository,
  activities: activityRepository,
  files: fileRepository,
  announcements: announcementRepository,
  comments: commentRepository,
} as const;

export type Repositories = typeof repositories;

// Database configuration and utilities
export {
  initializeDatabase,
  closeDatabase,
  getPool,
  query,
  transaction,
  healthCheck,
  getPoolStats,
  databaseMetrics
} from '../config/database';

// DatabaseManager class for Phase 2 compatibility
export class DatabaseManager {
  private static instance: DatabaseManager;
  
  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }
  async query(text: string, params?: any[], client?: any): Promise<any> {
    const { query } = await import('../config/database');
    return await query(text, params, client);
  }
  
  async one(text: string, params?: any[], client?: any): Promise<any> {
    const result = await this.query(text, params, client);
    if (result.rows.length === 0) {
      throw new Error('No rows returned');
    }
    return result.rows[0];
  }
  
  async many(text: string, params?: any[], client?: any): Promise<any[]> {
    const result = await this.query(text, params, client);
    return result.rows;
  }
  
  async none(text: string, params?: any[], client?: any): Promise<void> {
    await this.query(text, params, client);
  }
  
  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const { transaction } = await import('../config/database');
    return await transaction(callback);
  }
}

// Migration system
export {
  runMigrations,
  rollbackLastMigration,
  getMigrationStatus,
  validateMigrations
} from './migrator';

export default repositories;