/**
 * WebSocket Event Types and Interfaces
 * Comprehensive type definitions for real-time communication
 */

// Base event structure
export interface BaseSocketEvent {
  type: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: 'ceo' | 'manager' | 'staff';
}

// Connection events
export interface ConnectionEvent extends BaseSocketEvent {
  type: 'user_connected' | 'user_disconnected';
  socketId: string;
  channelIds: string[];
}

export interface UserStatusEvent extends BaseSocketEvent {
  type: 'user_status_update';
  status: 'online' | 'away' | 'busy' | 'offline';
  lastSeen?: string;
}

// Channel events
export interface ChannelEvent extends BaseSocketEvent {
  channelId: string;
}

export interface ChannelJoinEvent extends ChannelEvent {
  type: 'user_joined_channel' | 'user_left_channel';
  memberCount: number;
}

export interface ChannelUpdateEvent extends ChannelEvent {
  type: 'channel_updated' | 'channel_created' | 'channel_deleted';
  updates: {
    name?: string;
    description?: string;
    privacy?: 'public' | 'private' | 'restricted';
    settings?: Record<string, any>;
  };
}

// Message events
export interface ChatMessageEvent extends ChannelEvent {
  type: 'chat_message';
  messageId: string;
  message: string;
  messageType: 'text' | 'file' | 'voice' | 'system';
  attachments?: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    size: number;
  }>;
  replyTo?: string;
  edited?: boolean;
  editedAt?: string;
}

export interface MessageUpdateEvent extends ChannelEvent {
  type: 'message_updated' | 'message_deleted';
  messageId: string;
  updates?: Partial<ChatMessageEvent>;
}

export interface TypingEvent extends ChannelEvent {
  type: 'typing_indicator';
  isTyping: boolean;
}

// Task events
export interface TaskEvent extends BaseSocketEvent {
  taskId: string;
  channelId?: string;
}

export interface TaskUpdateEvent extends TaskEvent {
  type: 'task_created' | 'task_updated' | 'task_deleted' | 'task_completed';
  task: {
    id: string;
    title: string;
    description?: string;
    status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled' | 'on_hold';
    priority: 'low' | 'medium' | 'high' | 'urgent' | 'critical';
    assignedTo: string[];
    dueDate?: string;
    progress: number;
    tags: string[];
  };
  action: 'create' | 'update' | 'delete' | 'assign' | 'unassign' | 'complete' | 'reopen';
  changes?: Record<string, any>;
}

export interface TaskAssignmentEvent extends TaskEvent {
  type: 'task_assigned' | 'task_unassigned';
  assignedTo: string[];
  assignedBy: string;
  previousAssignees?: string[];
}

export interface TaskCommentEvent extends TaskEvent {
  type: 'task_comment_added' | 'task_comment_updated' | 'task_comment_deleted';
  commentId: string;
  comment: string;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
  }>;
}

// Voice command events (Phase 2)
export interface VoiceCommandEvent extends BaseSocketEvent {
  type: 'voice_command_received' | 'voice_command_processed' | 'voice_command_failed';
  commandId: string;
  channelId?: string;
  audioData?: string; // Base64 encoded audio
  transcription?: string;
  intent?: {
    action: string;
    entities: Record<string, any>;
    confidence: number;
  };
  result?: {
    success: boolean;
    message: string;
    actions: Array<{
      type: string;
      target: string;
      data: any;
    }>;
  };
  error?: string;
}

// Notification events
export interface NotificationEvent extends BaseSocketEvent {
  type: 'notification';
  notificationId: string;
  title: string;
  message: string;
  category: 'task' | 'channel' | 'mention' | 'system' | 'voice';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionUrl?: string;
  actionText?: string;
  data?: Record<string, any>;
  readAt?: string;
  expiresAt?: string;
}

// Analytics events (Phase 4)
export interface AnalyticsEvent extends BaseSocketEvent {
  type: 'analytics_update';
  metric: string;
  value: number | string | Record<string, any>;
  filters?: Record<string, any>;
  timeRange?: {
    start: string;
    end: string;
  };
}

// Error events
export interface ErrorEvent {
  type: 'error';
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
  retryable: boolean;
}

// System events
export interface SystemEvent extends BaseSocketEvent {
  type: 'system_announcement' | 'system_maintenance' | 'system_update';
  title: string;
  message: string;
  level: 'info' | 'warning' | 'critical';
  scheduledAt?: string;
  affectedServices?: string[];
}

// Union type for all events
export type SocketEvent = 
  | ConnectionEvent
  | UserStatusEvent
  | ChannelJoinEvent
  | ChannelUpdateEvent
  | ChatMessageEvent
  | MessageUpdateEvent
  | TypingEvent
  | TaskUpdateEvent
  | TaskAssignmentEvent
  | TaskCommentEvent
  | VoiceCommandEvent
  | NotificationEvent
  | AnalyticsEvent
  | ErrorEvent
  | SystemEvent;

// Client-to-server event types
export interface ClientToServerEvents {
  // Authentication
  authenticate: (token: string) => void;

  // Channel operations
  join_channel: (data: { channelId: string }) => void;
  leave_channel: (data: { channelId: string }) => void;

  // Messaging
  chat_message: (data: {
    channelId: string;
    message: string;
    type?: 'text' | 'file' | 'voice';
    replyTo?: string;
    attachments?: Array<{
      name: string;
      type: string;
      data: string; // Base64
    }>;
  }) => void;

  // Task operations
  task_update: (data: {
    taskId: string;
    updates: Record<string, any>;
    action: 'create' | 'update' | 'delete' | 'assign' | 'complete';
  }) => void;

  task_comment: (data: {
    taskId: string;
    comment: string;
    attachments?: Array<{
      name: string;
      data: string;
    }>;
  }) => void;

  // Voice commands (Phase 2)
  voice_command: (data: {
    audioData?: string; // Base64 encoded audio
    command?: string; // Text command
    channelId?: string;
  }) => void;

  // Presence and status
  typing_start: (data: { channelId: string }) => void;
  typing_stop: (data: { channelId: string }) => void;
  presence_update: (data: { 
    status: 'online' | 'away' | 'busy' | 'offline' 
  }) => void;

  // Notifications
  mark_notification_read: (data: { notificationId: string }) => void;
  
  // Subscriptions
  subscribe_to_analytics: (data: { 
    metrics: string[]; 
    filters?: Record<string, any> 
  }) => void;
}

// Server-to-client event types
export interface ServerToClientEvents {
  // Connection
  connected: (data: {
    userId: string;
    socketId: string;
    timestamp: string;
  }) => void;

  // Channel events
  channel_joined: (data: {
    channelId: string;
    memberCount: number;
  }) => void;
  
  channel_left: (data: {
    channelId: string;
  }) => void;

  user_joined_channel: (data: ChannelJoinEvent) => void;
  user_left_channel: (data: ChannelJoinEvent) => void;
  channel_updated: (data: ChannelUpdateEvent) => void;

  // Messages
  chat_message: (data: ChatMessageEvent) => void;
  message_updated: (data: MessageUpdateEvent) => void;
  message_deleted: (data: MessageUpdateEvent) => void;
  typing_indicator: (data: TypingEvent) => void;

  // Tasks
  task_update: (data: TaskUpdateEvent) => void;
  task_assigned: (data: TaskAssignmentEvent) => void;
  task_comment_added: (data: TaskCommentEvent) => void;

  // Voice
  voice_command_received: (data: {
    status: 'processing' | 'completed' | 'failed';
    timestamp: string;
    commandId?: string;
  }) => void;
  voice_command_result: (data: VoiceCommandEvent) => void;

  // User status
  user_status_update: (data: UserStatusEvent) => void;

  // Notifications
  notification: (data: NotificationEvent) => void;

  // Analytics
  analytics_update: (data: AnalyticsEvent) => void;

  // System
  system_announcement: (data: SystemEvent) => void;

  // Error handling
  error: (data: ErrorEvent) => void;
}

// Room types
export type RoomType = 'user' | 'channel' | 'task' | 'global' | 'voice_session';

// Permission types for WebSocket operations
export interface SocketPermissions {
  canJoinChannel: (channelId: string, userId: string) => Promise<boolean>;
  canSendMessage: (channelId: string, userId: string) => Promise<boolean>;
  canUpdateTask: (taskId: string, userId: string, action: string) => Promise<boolean>;
  canUseVoiceCommands: (userId: string, userRole: string) => boolean;
  canViewAnalytics: (userId: string, userRole: string) => boolean;
}

// Rate limiting configuration
export interface RateLimitConfig {
  messages: {
    maxPerMinute: number;
    maxPerHour: number;
  };
  voiceCommands: {
    maxPerMinute: number;
    maxPerHour: number;
  };
  taskUpdates: {
    maxPerMinute: number;
  };
}

// WebSocket middleware types
export interface SocketMiddleware {
  name: string;
  handler: (socket: any, next: (err?: Error) => void) => void;
}

export interface SocketEventHandler<T = any> {
  event: string;
  handler: (socket: any, data: T) => Promise<void> | void;
  permissions?: string[];
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

/**
 * Common interface for socket managers
 * Used by broadcasting components to interact with socket managers
 */
export interface ISocketManager {
  // Event emitter capabilities (for EventEmitter compatibility)
  on?(event: string, listener: (...args: any[]) => void): any;
  emit?(event: string, ...args: any[]): boolean;
  
  // User connection methods
  isUserConnected(userId: string): boolean;
  emitToUser(userId: string, event: string, data: any): Promise<void>;
  
  // Optional methods that may be needed
  emitToChannel?(channelId: string, event: string, data: any): Promise<void>;
  getUserConnections?(userId: string): any[];
}

// All types are exported individually, no default export needed for types