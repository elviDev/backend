"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUserRoutes = void 0;
const typebox_1 = require("@sinclair/typebox");
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
const middleware_1 = require("@auth/middleware");
const CacheService_1 = require("../../services/CacheService");
const cache_decorators_1 = require("@utils/cache-decorators");
const validation_1 = require("@utils/validation");
/**
 * User Management API Routes
 * Enterprise-grade user CRUD operations with caching and security
 */
// Request/Response Schemas
const CreateUserSchema = typebox_1.Type.Object({
    email: validation_1.EmailSchema,
    password: typebox_1.Type.String({ minLength: 8, maxLength: 128 }),
    name: typebox_1.Type.String({ minLength: 1, maxLength: 255 }),
    role: validation_1.UserRoleSchema,
    department: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 100 })),
    job_title: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 100 })),
    phone: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 20 })),
    avatar_url: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'uri' })),
    timezone: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 50 })),
    language_preference: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 10 })),
});
const UpdateUserSchema = typebox_1.Type.Object({
    name: typebox_1.Type.Optional(typebox_1.Type.String({ minLength: 1, maxLength: 255 })),
    department: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 100 })),
    job_title: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 100 })),
    phone: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 20 })),
    avatar_url: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'uri' })),
    timezone: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 50 })),
    language_preference: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 10 })),
    notification_settings: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
    voice_settings: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
});
const ChangePasswordSchema = typebox_1.Type.Object({
    currentPassword: typebox_1.Type.String(),
    newPassword: typebox_1.Type.String({ minLength: 8, maxLength: 128 }),
});
const UserResponseSchema = typebox_1.Type.Object({
    id: validation_1.UUIDSchema,
    email: validation_1.EmailSchema,
    name: typebox_1.Type.String(),
    role: validation_1.UserRoleSchema,
    department: typebox_1.Type.Optional(typebox_1.Type.String()),
    job_title: typebox_1.Type.Optional(typebox_1.Type.String()),
    phone: typebox_1.Type.Optional(typebox_1.Type.String()),
    avatar_url: typebox_1.Type.Optional(typebox_1.Type.String()),
    timezone: typebox_1.Type.Optional(typebox_1.Type.String()),
    language_preference: typebox_1.Type.Optional(typebox_1.Type.String()),
    notification_settings: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
    voice_settings: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Any())),
    email_verified: typebox_1.Type.Boolean(),
    last_active: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
    created_at: typebox_1.Type.String({ format: 'date-time' }),
    updated_at: typebox_1.Type.String({ format: 'date-time' }),
});
const UserListResponseSchema = typebox_1.Type.Object({
    success: typebox_1.Type.Boolean(),
    data: typebox_1.Type.Array(UserResponseSchema),
    pagination: typebox_1.Type.Object({
        total: typebox_1.Type.Integer(),
        limit: typebox_1.Type.Integer(),
        offset: typebox_1.Type.Integer(),
        hasMore: typebox_1.Type.Boolean(),
    }),
    timestamp: typebox_1.Type.String({ format: 'date-time' }),
});
/**
 * User service class with caching decorators
 */
class UserService {
    async getUserById(userId) {
        return await index_1.userRepository.findById(userId);
    }
    async updateUser(userId, updateData) {
        return await index_1.userRepository.update(userId, updateData);
    }
    async createUser(userData) {
        return await index_1.userRepository.createUser(userData);
    }
}
__decorate([
    (0, cache_decorators_1.Cacheable)({
        ttl: 3600,
        namespace: 'users',
        keyGenerator: (userId) => cache_decorators_1.CacheKeyUtils.userKey(userId)
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UserService.prototype, "getUserById", null);
__decorate([
    (0, cache_decorators_1.CacheEvict)({
        keys: (userId) => [cache_decorators_1.CacheKeyUtils.userKey(userId), `${cache_decorators_1.CacheKeyUtils.userKey(userId)}:profile`],
        namespace: 'users'
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UserService.prototype, "updateUser", null);
__decorate([
    (0, cache_decorators_1.CacheEvict)({
        allEntries: true,
        namespace: 'users'
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserService.prototype, "createUser", null);
const userService = new UserService();
/**
 * Register user routes
 */
const registerUserRoutes = async (fastify) => {
    /**
     * GET /users - List all users (Admin/Manager only)
     */
    fastify.get('/users', {
        preHandler: [middleware_1.authenticate, (0, middleware_1.authorizeRoles)('ceo', 'manager'), middleware_1.apiRateLimit],
        schema: {
            querystring: typebox_1.Type.Intersect([
                validation_1.PaginationSchema,
                typebox_1.Type.Object({
                    search: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 100 })),
                    role: typebox_1.Type.Optional(validation_1.UserRoleSchema),
                    department: typebox_1.Type.Optional(typebox_1.Type.String({ maxLength: 100 })),
                    status: typebox_1.Type.Optional(typebox_1.Type.Union([
                        typebox_1.Type.Literal('active'),
                        typebox_1.Type.Literal('inactive'),
                        typebox_1.Type.Literal('suspended')
                    ])),
                })
            ]),
            response: {
                200: UserListResponseSchema,
                401: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String()
                    })
                }),
                403: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String()
                    })
                })
            }
        }
    }, async (request, reply) => {
        try {
            const { limit = 20, offset = 0, search, role, department, status } = request.query;
            // Build filters
            const filters = {};
            if (search) {
                filters.search = search;
            }
            if (role) {
                filters.role = role;
            }
            if (department) {
                filters.department = department;
            }
            if (status) {
                filters.status = status;
            }
            // Get users with pagination
            const result = await index_1.userRepository.findMany({
                filters,
                limit: Math.min(limit, 100), // Cap at 100
                offset,
                orderBy: 'created_at',
                orderDirection: 'DESC'
            });
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                filters,
                resultCount: result.data.length,
                total: result.total
            }, 'Users list retrieved');
            reply.send({
                success: true,
                data: result.data.map(user => ({
                    ...user,
                    // Remove sensitive fields
                    password_hash: undefined,
                    reset_token: undefined,
                    verification_token: undefined,
                })),
                pagination: {
                    total: result.total,
                    limit,
                    offset,
                    hasMore: offset + limit < result.total
                },
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
                ...(request.user && {
                    user: {
                        id: request.user.id,
                        email: request.user.email,
                        role: request.user.role
                    }
                }),
                ip: request.ip,
                method: request.method,
                url: request.url,
                headers: request.headers
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve users list');
            reply.code(500).send({
                error: {
                    message: 'Failed to retrieve users',
                    code: 'SERVER_ERROR'
                }
            });
        }
    });
    /**
     * GET /users/:id - Get user by ID
     */
    fastify.get('/users/:id', {
        preHandler: [middleware_1.authenticate, (0, middleware_1.requireResourceOwnership)('id')],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: UserResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' })
                }),
                404: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String()
                    })
                })
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            // Use cached service method
            const user = await userService.getUserById(id);
            if (!user) {
                throw new errors_1.NotFoundError('User not found');
            }
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                requestedUserId: id
            }, 'User profile retrieved');
            reply.send({
                success: true,
                data: {
                    ...user,
                    // Remove sensitive fields
                    password_hash: undefined,
                    reset_token: undefined,
                    verification_token: undefined,
                },
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
                ...(request.user && {
                    user: {
                        id: request.user.id,
                        email: request.user.email,
                        role: request.user.role
                    }
                }),
                ip: request.ip,
                method: request.method,
                url: request.url,
                headers: request.headers
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to retrieve user');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to retrieve user',
                        code: 'SERVER_ERROR'
                    }
                });
            }
        }
    });
    /**
     * POST /users - Create new user (Admin only)
     */
    fastify.post('/users', {
        preHandler: [middleware_1.authenticate, (0, middleware_1.authorizeRoles)('ceo'), middleware_1.apiRateLimit],
        schema: {
            body: CreateUserSchema,
            response: {
                201: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: UserResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' })
                }),
                400: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                        details: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
                            field: typebox_1.Type.String(),
                            message: typebox_1.Type.String(),
                            value: typebox_1.Type.Optional(typebox_1.Type.Any())
                        })))
                    })
                })
            }
        }
    }, async (request, reply) => {
        try {
            const userData = {
                ...request.body,
                created_by: request.user?.userId,
            };
            // Create user using cached service
            const user = await userService.createUser(userData);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                createdUserId: user.id,
                userEmail: user.email,
                userRole: user.role
            }, 'User created successfully');
            reply.code(201).send({
                success: true,
                data: {
                    ...user,
                    password_hash: undefined,
                    reset_token: undefined,
                    verification_token: undefined,
                },
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
                ...(request.user && {
                    user: {
                        id: request.user.id,
                        email: request.user.email,
                        role: request.user.role
                    }
                }),
                ip: request.ip,
                method: request.method,
                url: request.url,
                headers: request.headers
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to create user');
            if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to create user',
                        code: 'SERVER_ERROR'
                    }
                });
            }
        }
    });
    /**
     * PUT /users/:id - Update user
     */
    fastify.put('/users/:id', {
        preHandler: [middleware_1.authenticate, (0, middleware_1.requireResourceOwnership)('id')],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema
            }),
            body: UpdateUserSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: UserResponseSchema,
                    timestamp: typebox_1.Type.String({ format: 'date-time' })
                })
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const updateData = request.body;
            // Update user using cached service (will evict cache)
            const user = await userService.updateUser(id, updateData);
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                updatedUserId: id,
                updatedFields: Object.keys(updateData)
            }, 'User updated successfully');
            reply.send({
                success: true,
                data: {
                    ...user,
                    password_hash: undefined,
                    reset_token: undefined,
                    verification_token: undefined,
                },
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
                ...(request.user && {
                    user: {
                        id: request.user.id,
                        email: request.user.email,
                        role: request.user.role
                    }
                }),
                ip: request.ip,
                method: request.method,
                url: request.url,
                headers: request.headers
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to update user');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to update user',
                        code: 'SERVER_ERROR'
                    }
                });
            }
        }
    });
    /**
     * POST /users/:id/change-password - Change user password
     */
    fastify.post('/users/:id/change-password', {
        preHandler: [middleware_1.authenticate, (0, middleware_1.requireResourceOwnership)('id')],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema
            }),
            body: ChangePasswordSchema,
            response: {
                200: validation_1.SuccessResponseSchema
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { currentPassword, newPassword } = request.body;
            // Verify current password
            const user = await index_1.userRepository.findById(id);
            if (!user) {
                throw new errors_1.NotFoundError('User not found');
            }
            const isCurrentPasswordValid = await index_1.userRepository.verifyPassword(user.email, currentPassword);
            if (!isCurrentPasswordValid) {
                throw new errors_1.ValidationError('Current password is incorrect', [
                    { field: 'currentPassword', message: 'Invalid password' }
                ]);
            }
            // Update password
            const success = await index_1.userRepository.updatePassword(id, newPassword);
            if (!success) {
                throw new Error('Failed to update password');
            }
            // Clear user cache
            await CacheService_1.cacheService.users.delete(cache_decorators_1.CacheKeyUtils.userKey(id));
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                targetUserId: id
            }, 'Password changed successfully');
            reply.send({
                success: true,
                message: 'Password changed successfully',
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
                ...(request.user && {
                    user: {
                        id: request.user.id,
                        email: request.user.email,
                        role: request.user.role
                    }
                }),
                ip: request.ip,
                method: request.method,
                url: request.url,
                headers: request.headers
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to change password');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to change password',
                        code: 'SERVER_ERROR'
                    }
                });
            }
        }
    });
    /**
     * DELETE /users/:id - Soft delete user (Admin only)
     */
    fastify.delete('/users/:id', {
        preHandler: [middleware_1.authenticate, (0, middleware_1.authorizeRoles)('ceo')],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema
            }),
            response: {
                200: validation_1.SuccessResponseSchema
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            // Prevent self-deletion
            if (id === request.user?.userId) {
                throw new errors_1.ValidationError('Cannot delete your own account', []);
            }
            const success = await index_1.userRepository.softDelete(id, request.user.userId);
            if (!success) {
                throw new errors_1.NotFoundError('User not found');
            }
            // Clear user cache
            await CacheService_1.cacheService.users.delete(cache_decorators_1.CacheKeyUtils.userKey(id));
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                deletedUserId: id
            }, 'User deleted successfully');
            reply.send({
                success: true,
                message: 'User deleted successfully',
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
                ...(request.user && {
                    user: {
                        id: request.user.id,
                        email: request.user.email,
                        role: request.user.role
                    }
                }),
                ip: request.ip,
                method: request.method,
                url: request.url,
                headers: request.headers
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to delete user');
            if (error instanceof errors_1.NotFoundError || error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to delete user',
                        code: 'SERVER_ERROR'
                    }
                });
            }
        }
    });
    /**
     * GET /users/:id/stats - Get user statistics (Admin/Manager only)
     */
    fastify.get('/users/:id/stats', {
        preHandler: [middleware_1.authenticate, (0, middleware_1.authorizeRoles)('ceo', 'manager')],
        schema: {
            params: typebox_1.Type.Object({
                id: validation_1.UUIDSchema
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        userId: validation_1.UUIDSchema,
                        taskStats: typebox_1.Type.Object({
                            total: typebox_1.Type.Integer(),
                            completed: typebox_1.Type.Integer(),
                            inProgress: typebox_1.Type.Integer(),
                            overdue: typebox_1.Type.Integer(),
                        }),
                        channelStats: typebox_1.Type.Object({
                            memberships: typebox_1.Type.Integer(),
                            messagesCount: typebox_1.Type.Integer(),
                        }),
                        activityStats: typebox_1.Type.Object({
                            lastActive: typebox_1.Type.Optional(typebox_1.Type.String({ format: 'date-time' })),
                            totalSessions: typebox_1.Type.Integer(),
                            avgSessionDuration: typebox_1.Type.Number(),
                        }),
                    }),
                    timestamp: typebox_1.Type.String({ format: 'date-time' })
                })
            }
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            // Get user stats from repositories
            const [user, taskStats] = await Promise.all([
                index_1.userRepository.findById(id),
                // taskRepository.getTaskStats(id), // TODO: Implement
                Promise.resolve({
                    total: 0,
                    completed: 0,
                    inProgress: 0,
                    overdue: 0,
                })
            ]);
            if (!user) {
                throw new errors_1.NotFoundError('User not found');
            }
            // TODO: Get channel stats, activity stats from respective repositories
            const stats = {
                userId: id,
                taskStats,
                channelStats: {
                    memberships: 0,
                    messagesCount: 0,
                },
                activityStats: {
                    lastActive: user.last_active?.toISOString(),
                    totalSessions: 0,
                    avgSessionDuration: 0,
                },
            };
            logger_1.loggers.api.info({
                userId: request.user?.userId,
                requestedUserId: id
            }, 'User stats retrieved');
            reply.send({
                success: true,
                data: stats,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            const context = (0, errors_1.createErrorContext)({
                ...(request.user && {
                    user: {
                        id: request.user.id,
                        email: request.user.email,
                        role: request.user.role
                    }
                }),
                ip: request.ip,
                method: request.method,
                url: request.url,
                headers: request.headers
            });
            logger_1.loggers.api.error({ error, context }, 'Failed to get user stats');
            if (error instanceof errors_1.NotFoundError) {
                reply.code(404).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to get user stats',
                        code: 'SERVER_ERROR'
                    }
                });
            }
        }
    });
};
exports.registerUserRoutes = registerUserRoutes;
//# sourceMappingURL=UserRoutes.js.map