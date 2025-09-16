import { DatabaseClient } from '@config/database';
import BaseRepository, { BaseEntity } from './BaseRepository';
export interface User extends BaseEntity {
    email: string;
    name: string;
    password_hash: string;
    role: 'ceo' | 'manager' | 'staff';
    avatar_url?: string;
    phone?: string;
    department?: string;
    job_title?: string;
    language_preference: string;
    timezone: string;
    notification_settings: Record<string, any>;
    voice_settings: Record<string, any>;
    failed_login_attempts: number;
    account_locked_until?: Date;
    password_reset_token?: string;
    password_reset_expires?: Date;
    email_verification_token?: string;
    email_verified: boolean;
    last_active?: Date;
    last_login?: Date;
    login_count: number;
    created_by?: string;
}
export interface CreateUserData {
    email: string;
    name: string;
    password: string;
    role: 'ceo' | 'manager' | 'staff';
    avatar_url?: string;
    phone?: string;
    department?: string;
    job_title?: string;
    language_preference?: string;
    timezone?: string;
    notification_settings?: Record<string, any>;
    voice_settings?: Record<string, any>;
    created_by?: string;
}
export interface UpdateUserData {
    name?: string;
    avatar_url?: string;
    phone?: string;
    department?: string;
    job_title?: string;
    language_preference?: string;
    timezone?: string;
    notification_settings?: Record<string, any>;
    voice_settings?: Record<string, any>;
}
export interface UserStats {
    totalUsers: number;
    activeUsers: number;
    usersByRole: Record<string, number>;
    recentLogins: number;
    averageLoginCount: number;
}
declare class UserRepository extends BaseRepository<User> {
    constructor();
    /**
     * Create new user with password hashing
     */
    createUser(userData: CreateUserData, client?: DatabaseClient): Promise<User>;
    /**
     * Find user by email
     */
    findByEmail(email: string, includeDeleted?: boolean, client?: DatabaseClient): Promise<User | null>;
    /**
     * Find user by email for authentication (includes password hash)
     */
    findByEmailForAuth(email: string, client?: DatabaseClient): Promise<(User & {
        password_hash: string;
    }) | null>;
    /**
     * Find users by role
     */
    findByRole(role: User['role'], includeDeleted?: boolean, client?: DatabaseClient): Promise<User[]>;
    /**
     * Find users by department
     */
    findByDepartment(department: string, includeDeleted?: boolean, client?: DatabaseClient): Promise<User[]>;
    /**
     * Update user password
     */
    updatePassword(userId: string, newPassword: string, expectedVersion?: number, client?: DatabaseClient): Promise<boolean>;
    /**
     * Verify user password
     */
    verifyPassword(email: string, password: string, client?: DatabaseClient): Promise<User | null>;
    /**
     * Record successful login
     */
    recordSuccessfulLogin(userId: string, client?: DatabaseClient): Promise<void>;
    /**
     * Increment failed login attempts and potentially lock account
     */
    incrementFailedLoginAttempts(userId: string, client?: DatabaseClient): Promise<void>;
    /**
     * Update last active timestamp
     */
    updateLastActive(userId: string, client?: DatabaseClient): Promise<void>;
    /**
     * Set password reset token
     */
    setPasswordResetToken(email: string, token: string, expiresIn?: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Verify password reset token
     */
    verifyPasswordResetToken(token: string, client?: DatabaseClient): Promise<User | null>;
    /**
     * Set email verification token
     */
    setEmailVerificationToken(userId: string, token: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Verify email with token
     */
    verifyEmail(token: string, client?: DatabaseClient): Promise<User | null>;
    /**
     * Search users by name or email
     */
    searchUsers(searchTerm: string, limit?: number, offset?: number, client?: DatabaseClient): Promise<User[]>;
    /**
     * Get active users (logged in recently)
     */
    getActiveUsers(withinHours?: number, client?: DatabaseClient): Promise<User[]>;
    /**
     * Get user statistics
     */
    getUserStats(client?: DatabaseClient): Promise<UserStats>;
    /**
     * Update user profile
     */
    updateProfile(userId: string, profileData: UpdateUserData, expectedVersion?: number, client?: DatabaseClient): Promise<User>;
    /**
     * Unlock user account
     */
    unlockAccount(userId: string, client?: DatabaseClient): Promise<boolean>;
    /**
     * Get users for channel assignment suggestions
     */
    getUsersForChannelAssignment(channelId: string, excludeUserIds?: string[], client?: DatabaseClient): Promise<User[]>;
    /**
     * Find all unverified users
     */
    findUnverifiedUsers(client?: DatabaseClient): Promise<User[]>;
    /**
     * Delete all unverified users (hard delete for cleanup)
     */
    deleteUnverifiedUsers(client?: DatabaseClient): Promise<number>;
}
export default UserRepository;
//# sourceMappingURL=UserRepository.d.ts.map