"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
const BaseRepository_1 = __importDefault(require("./BaseRepository"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const index_1 = require("@config/index");
class UserRepository extends BaseRepository_1.default {
    constructor() {
        super('users');
        // Exclude sensitive fields from default select
        this.selectFields = [
            'id',
            'email',
            'name',
            'role',
            'avatar_url',
            'phone',
            'department',
            'job_title',
            'language_preference',
            'timezone',
            'notification_settings',
            'voice_settings',
            'email_verified',
            'last_active',
            'last_login',
            'login_count',
            'created_at',
            'updated_at',
            'version',
            'deleted_at',
            'created_by',
        ];
    }
    /**
     * Create new user with password hashing
     */
    async createUser(userData, client) {
        // Validate unique email
        const existingUser = await this.findByEmail(userData.email, false, client);
        if (existingUser) {
            throw new errors_1.ConflictError('Email already exists', { email: userData.email });
        }
        // Validate CEO uniqueness
        if (userData.role === 'ceo') {
            const existingCEO = await this.findByRole('ceo', false, client);
            if (existingCEO.length > 0) {
                throw new errors_1.ConflictError('CEO role already exists', { role: 'ceo' });
            }
        }
        // Hash password
        const password_hash = await bcryptjs_1.default.hash(userData.password, index_1.config.security.bcryptRounds);
        // Prepare user data
        const { password, ...userDataWithoutPassword } = userData;
        const userToCreate = {
            ...userDataWithoutPassword,
            password_hash,
            email_verified: false,
            failed_login_attempts: 0,
            login_count: 0,
            language_preference: userData.language_preference || 'en',
            timezone: userData.timezone || 'UTC',
        };
        const user = await this.create(userToCreate, client);
        logger_1.logger.info({
            userId: user.id,
            email: user.email,
            role: user.role,
        }, 'User created successfully');
        return user;
    }
    /**
     * Find user by email
     */
    async findByEmail(email, includeDeleted = false, client) {
        const deletedCondition = includeDeleted ? '' : 'AND deleted_at IS NULL';
        const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE LOWER(email) = LOWER($1) ${deletedCondition}
    `;
        const result = await this.executeRawQuery(sql, [email], client);
        return result.rows[0] || null;
    }
    /**
     * Find user by email for authentication (includes password hash)
     */
    async findByEmailForAuth(email, client) {
        const sql = `
      SELECT id, email, name, role, password_hash, email_verified,
             failed_login_attempts, account_locked_until, version,
             last_active, last_login, login_count
      FROM ${this.tableName}
      WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [email], client);
        return result.rows[0] || null;
    }
    /**
     * Find users by role
     */
    async findByRole(role, includeDeleted = false, client) {
        const options = {
            filters: { role },
            includeDeleted,
            orderBy: 'name',
            orderDirection: 'ASC',
        };
        const result = await this.findMany(options, client);
        return result.data;
    }
    /**
     * Find users by department
     */
    async findByDepartment(department, includeDeleted = false, client) {
        const options = {
            filters: { department },
            includeDeleted,
            orderBy: 'name',
            orderDirection: 'ASC',
        };
        const result = await this.findMany(options, client);
        return result.data;
    }
    /**
     * Update user password
     */
    async updatePassword(userId, newPassword, expectedVersion, client) {
        const password_hash = await bcryptjs_1.default.hash(newPassword, index_1.config.security.bcryptRounds);
        const sql = `
      UPDATE ${this.tableName}
      SET password_hash = $2, password_reset_token = NULL, password_reset_expires = NULL
      WHERE id = $1 AND deleted_at IS NULL
      ${expectedVersion ? 'AND version = $3' : ''}
      RETURNING id
    `;
        const params = expectedVersion
            ? [userId, password_hash, expectedVersion]
            : [userId, password_hash];
        const result = await this.executeRawQuery(sql, params, client);
        const success = result.rows.length > 0;
        if (success) {
            logger_1.logger.info({ userId }, 'User password updated successfully');
        }
        return success;
    }
    /**
     * Verify user password
     */
    async verifyPassword(email, password, client) {
        const user = await this.findByEmailForAuth(email, client);
        if (!user) {
            return null;
        }
        // Check account lock
        if (user.account_locked_until && user.account_locked_until > new Date()) {
            throw new errors_1.ValidationError('Account is temporarily locked', [
                {
                    field: 'account',
                    message: 'Account locked due to failed login attempts',
                    value: user.account_locked_until,
                },
            ]);
        }
        const isValidPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isValidPassword) {
            // Increment failed attempts
            await this.incrementFailedLoginAttempts(user.id, client);
            return null;
        }
        // Reset failed attempts and update login info
        await this.recordSuccessfulLogin(user.id, client);
        // Return user without password hash
        const { password_hash, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }
    /**
     * Record successful login
     */
    async recordSuccessfulLogin(userId, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET 
        failed_login_attempts = 0,
        account_locked_until = NULL,
        last_login = NOW(),
        last_active = NOW(),
        login_count = login_count + 1
      WHERE id = $1
    `;
        await this.executeRawQuery(sql, [userId], client);
    }
    /**
     * Increment failed login attempts and potentially lock account
     */
    async incrementFailedLoginAttempts(userId, client) {
        const maxAttempts = index_1.config.security.maxLoginAttempts;
        const lockoutDuration = index_1.config.security.lockoutDuration;
        const sql = `
      UPDATE ${this.tableName}
      SET 
        failed_login_attempts = failed_login_attempts + 1,
        account_locked_until = CASE 
          WHEN failed_login_attempts + 1 >= $2 THEN NOW() + INTERVAL '${lockoutDuration}'
          ELSE account_locked_until
        END
      WHERE id = $1
    `;
        await this.executeRawQuery(sql, [userId, maxAttempts], client);
        logger_1.logger.warn({ userId }, 'Failed login attempt recorded');
    }
    /**
     * Update last active timestamp
     */
    async updateLastActive(userId, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET last_active = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `;
        await this.executeRawQuery(sql, [userId], client);
    }
    /**
     * Set password reset token
     */
    async setPasswordResetToken(email, token, expiresIn = '1 hour', client) {
        const sql = `
      UPDATE ${this.tableName}
      SET 
        password_reset_token = $2,
        password_reset_expires = NOW() + INTERVAL '${expiresIn}'
      WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [email, token], client);
        return result.rowCount > 0;
    }
    /**
     * Verify password reset token
     */
    async verifyPasswordResetToken(token, client) {
        const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE password_reset_token = $1 
      AND password_reset_expires > NOW()
      AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [token], client);
        return result.rows[0] || null;
    }
    /**
     * Set email verification token
     */
    async setEmailVerificationToken(userId, token, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET email_verification_token = $2
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [userId, token], client);
        return result.rowCount > 0;
    }
    /**
     * Verify email with token
     */
    async verifyEmail(token, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET 
        email_verified = true,
        email_verification_token = NULL
      WHERE email_verification_token = $1 AND deleted_at IS NULL
      RETURNING ${this.selectFields.join(', ')}
    `;
        const result = await this.executeRawQuery(sql, [token], client);
        if (result.rows.length > 0 && result.rows[0]) {
            logger_1.logger.info({ userId: result.rows[0].id }, 'Email verified successfully');
        }
        return result.rows[0] || null;
    }
    /**
     * Search users by name or email
     */
    async searchUsers(searchTerm, limit = 20, offset = 0, client) {
        const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE (
        LOWER(name) LIKE LOWER($1) OR 
        LOWER(email) LIKE LOWER($1) OR
        LOWER(department) LIKE LOWER($1) OR
        LOWER(job_title) LIKE LOWER($1)
      )
      AND deleted_at IS NULL
      ORDER BY 
        CASE WHEN LOWER(name) LIKE LOWER($1) THEN 1 ELSE 2 END,
        name ASC
      LIMIT $2 OFFSET $3
    `;
        const searchPattern = `%${searchTerm}%`;
        const result = await this.executeRawQuery(sql, [searchPattern, limit, offset], client);
        return result.rows;
    }
    /**
     * Get active users (logged in recently)
     */
    async getActiveUsers(withinHours = 24, client) {
        const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE last_active > NOW() - INTERVAL '${withinHours} hours'
      AND deleted_at IS NULL
      ORDER BY last_active DESC
    `;
        const result = await this.executeRawQuery(sql, [], client);
        return result.rows;
    }
    /**
     * Get user statistics
     */
    async getUserStats(client) {
        const sql = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '7 days') as active_users,
        COUNT(*) FILTER (WHERE role = 'ceo') as ceo_count,
        COUNT(*) FILTER (WHERE role = 'manager') as manager_count,
        COUNT(*) FILTER (WHERE role = 'staff') as staff_count,
        COUNT(*) FILTER (WHERE last_login > NOW() - INTERVAL '24 hours') as recent_logins,
        AVG(login_count) as average_login_count
      FROM ${this.tableName}
      WHERE deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [], client);
        const stats = result.rows[0];
        return {
            totalUsers: parseInt(stats.total_users, 10),
            activeUsers: parseInt(stats.active_users, 10),
            usersByRole: {
                ceo: parseInt(stats.ceo_count, 10),
                manager: parseInt(stats.manager_count, 10),
                staff: parseInt(stats.staff_count, 10),
            },
            recentLogins: parseInt(stats.recent_logins, 10),
            averageLoginCount: parseFloat(stats.average_login_count || '0'),
        };
    }
    /**
     * Update user profile
     */
    async updateProfile(userId, profileData, expectedVersion, client) {
        return this.update(userId, profileData, expectedVersion, client);
    }
    /**
     * Unlock user account
     */
    async unlockAccount(userId, client) {
        const sql = `
      UPDATE ${this.tableName}
      SET 
        failed_login_attempts = 0,
        account_locked_until = NULL
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [userId], client);
        if (result.rowCount > 0) {
            logger_1.logger.info({ userId }, 'User account unlocked');
        }
        return result.rowCount > 0;
    }
    /**
     * Get users for channel assignment suggestions
     */
    async getUsersForChannelAssignment(channelId, excludeUserIds = [], client) {
        const excludeCondition = excludeUserIds.length > 0 ? 'AND id != ALL($2)' : '';
        const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE deleted_at IS NULL 
      AND email_verified = true
      ${excludeCondition}
      ORDER BY 
        CASE role 
          WHEN 'ceo' THEN 1 
          WHEN 'manager' THEN 2 
          ELSE 3 
        END,
        last_active DESC NULLS LAST,
        name ASC
      LIMIT 50
    `;
        const params = excludeUserIds.length > 0 ? [excludeUserIds] : [];
        const result = await this.executeRawQuery(sql, params, client);
        return result.rows;
    }
    /**
     * Find all unverified users
     */
    async findUnverifiedUsers(client) {
        const sql = `
      SELECT ${this.selectFields.join(', ')}
      FROM ${this.tableName}
      WHERE email_verified = false AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
        const result = await this.executeRawQuery(sql, [], client);
        return result.rows;
    }
    /**
     * Delete all unverified users (hard delete for cleanup)
     */
    async deleteUnverifiedUsers(client) {
        const sql = `
      DELETE FROM ${this.tableName}
      WHERE email_verified = false AND deleted_at IS NULL
    `;
        const result = await this.executeRawQuery(sql, [], client);
        logger_1.logger.info({ deleteCount: result.rowCount }, 'Deleted unverified users');
        return result.rowCount || 0;
    }
}
exports.default = UserRepository;
//# sourceMappingURL=UserRepository.js.map