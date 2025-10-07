import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { userRepository } from '@db/index';
import { logger, loggers } from '@utils/logger';
import { 
  ValidationError, 
  NotFoundError, 
  AuthorizationError, 
  formatErrorResponse,
  createErrorContext 
} from '@utils/errors';
import { 
  authenticate, 
  authorize, 
  authorizeRoles, 
  requireResourceOwnership,
  apiRateLimit 
} from '@auth/middleware';
import { cacheService } from '../../services/CacheService';
import { Cacheable, CacheEvict, CacheKeyUtils } from '@utils/cache-decorators';
import { 
  UUIDSchema, 
  EmailSchema, 
  UserRoleSchema, 
  PaginationSchema,
  SuccessResponseSchema 
} from '@utils/validation';
import ProfilePictureService from '../../files/upload/ProfilePictureService';
import CloudinaryProfileService from '../../files/upload/CloudinaryProfileService';

/**
 * User Management API Routes
 * Enterprise-grade user CRUD operations with caching and security
 */

// Request/Response Schemas
const CreateUserSchema = Type.Object({
  email: EmailSchema,
  password: Type.String({ minLength: 8, maxLength: 128 }),
  name: Type.String({ minLength: 1, maxLength: 255 }),
  role: UserRoleSchema,
  department: Type.Optional(Type.String({ maxLength: 100 })),
  job_title: Type.Optional(Type.String({ maxLength: 100 })),
  phone: Type.Optional(Type.String({ maxLength: 20 })),
  avatar_url: Type.Optional(Type.String({ format: 'uri' })),
  timezone: Type.Optional(Type.String({ maxLength: 50 })),
  language_preference: Type.Optional(Type.String({ maxLength: 10 })),
});

const UpdateUserSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  department: Type.Optional(Type.String({ maxLength: 100 })),
  job_title: Type.Optional(Type.String({ maxLength: 100 })),
  phone: Type.Optional(Type.String({ maxLength: 20 })),
  avatar_url: Type.Optional(Type.String({ format: 'uri' })),
  timezone: Type.Optional(Type.String({ maxLength: 50 })),
  language_preference: Type.Optional(Type.String({ maxLength: 10 })),
  notification_settings: Type.Optional(Type.Record(Type.String(), Type.Any())),
  voice_settings: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

const ChangePasswordSchema = Type.Object({
  currentPassword: Type.String(),
  newPassword: Type.String({ minLength: 8, maxLength: 128 }),
});

const ProfilePictureUploadSchema = Type.Object({
  fileName: Type.String({ minLength: 1, maxLength: 100 }),
  contentType: Type.String({ minLength: 1 }),
  fileSize: Type.Number({ minimum: 1, maximum: 5 * 1024 * 1024 }), // 5MB max
  description: Type.Optional(Type.String({ maxLength: 255 })),
});

const ProfilePictureUploadResponseSchema = Type.Object({
  success: Type.Boolean(),
  data: Type.Optional(Type.Object({
    uploadUrl: Type.String(),
    downloadUrl: Type.Optional(Type.String()),
    fileId: Type.String(),
    expiresAt: Type.String({ format: 'date-time' }),
  })),
  error: Type.Optional(Type.String()),
  timestamp: Type.String({ format: 'date-time' }),
});

const UserResponseSchema = Type.Object({
  id: UUIDSchema,
  email: EmailSchema,
  name: Type.String(),
  role: UserRoleSchema,
  department: Type.Optional(Type.String()),
  job_title: Type.Optional(Type.String()),
  phone: Type.Optional(Type.String()),
  avatar_url: Type.Optional(Type.String()),
  timezone: Type.Optional(Type.String()),
  language_preference: Type.Optional(Type.String()),
  notification_settings: Type.Optional(Type.Record(Type.String(), Type.Any())),
  voice_settings: Type.Optional(Type.Record(Type.String(), Type.Any())),
  email_verified: Type.Boolean(),
  last_active: Type.Optional(Type.String({ format: 'date-time' })),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' }),
});

const UserListResponseSchema = Type.Object({
  success: Type.Boolean(),
  data: Type.Array(UserResponseSchema),
  pagination: Type.Object({
    total: Type.Integer(),
    limit: Type.Integer(),
    offset: Type.Integer(),
    hasMore: Type.Boolean(),
  }),
  timestamp: Type.String({ format: 'date-time' }),
});

/**
 * User service class with caching decorators
 */
class UserService {
  @Cacheable({ 
    ttl: 3600, 
    namespace: 'users',
    keyGenerator: (userId: string) => CacheKeyUtils.userKey(userId)
  })
  async getUserById(userId: string) {
    return await userRepository.findById(userId);
  }

  @CacheEvict({
    keys: (userId: string) => [CacheKeyUtils.userKey(userId), `${CacheKeyUtils.userKey(userId)}:profile`],
    namespace: 'users'
  })
  async updateUser(userId: string, updateData: any) {
    return await userRepository.update(userId, updateData);
  }

  @CacheEvict({
    allEntries: true,
    namespace: 'users'
  })
  async createUser(userData: any) {
    return await userRepository.createUser(userData);
  }
}

const userService = new UserService();
const profilePictureService = new ProfilePictureService();
const cloudinaryProfileService = new CloudinaryProfileService();

/**
 * Register user routes
 */
export const registerUserRoutes = async (fastify: FastifyInstance) => {
  
  /**
   * GET /users - List all users (Admin/Manager only)
   */
  fastify.get<{
    Querystring: typeof PaginationSchema.static & {
      search?: string;
      role?: string;
      department?: string;
      status?: string;
    }
  }>('/users', {
    preHandler: [authenticate, authorizeRoles('ceo', 'manager'), apiRateLimit],
    schema: {
      querystring: Type.Intersect([
        PaginationSchema,
        Type.Object({
          search: Type.Optional(Type.String({ maxLength: 100 })),
          role: Type.Optional(UserRoleSchema),
          department: Type.Optional(Type.String({ maxLength: 100 })),
          status: Type.Optional(Type.Union([
            Type.Literal('active'),
            Type.Literal('inactive'),
            Type.Literal('suspended')
          ])),
        })
      ]),
      response: {
        200: UserListResponseSchema,
        401: Type.Object({
          error: Type.Object({
            message: Type.String(),
            code: Type.String()
          })
        }),
        403: Type.Object({
          error: Type.Object({
            message: Type.String(),
            code: Type.String()
          })
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { limit = 20, offset = 0, search, role, department, status } = request.query;
      
      // Build filters
      const filters: any = {};
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
      const result = await userRepository.findMany({
        filters,
        limit: Math.min(limit, 100), // Cap at 100
        offset,
        orderBy: 'created_at',
        orderDirection: 'DESC'
      });

      loggers.api.info({
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

    } catch (error) {
      const context = createErrorContext({
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
        headers: request.headers as Record<string, string | string[] | undefined>
      });
      loggers.api.error({ error, context }, 'Failed to retrieve users list');
      
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
  fastify.get<{
    Params: { id: string }
  }>('/users/:id', {
    preHandler: [authenticate, requireResourceOwnership('id')],
    schema: {
      params: Type.Object({
        id: UUIDSchema
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          data: UserResponseSchema,
          timestamp: Type.String({ format: 'date-time' })
        }),
        404: Type.Object({
          error: Type.Object({
            message: Type.String(),
            code: Type.String()
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
        throw new NotFoundError('User not found');
      }

      loggers.api.info({
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

    } catch (error) {
      const context = createErrorContext({
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
        headers: request.headers as Record<string, string | string[] | undefined>
      });
      loggers.api.error({ error, context }, 'Failed to retrieve user');
      
      if (error instanceof NotFoundError) {
        reply.code(404).send(formatErrorResponse(error));
      } else {
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
  fastify.post<{
    Body: typeof CreateUserSchema.static
  }>('/users', {
    preHandler: [authenticate, authorizeRoles('ceo'), apiRateLimit],
    schema: {
      body: CreateUserSchema,
      response: {
        201: Type.Object({
          success: Type.Boolean(),
          data: UserResponseSchema,
          timestamp: Type.String({ format: 'date-time' })
        }),
        400: Type.Object({
          error: Type.Object({
            message: Type.String(),
            code: Type.String(),
            details: Type.Optional(Type.Array(Type.Object({
              field: Type.String(),
              message: Type.String(),
              value: Type.Optional(Type.Any())
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

      loggers.api.info({
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

    } catch (error) {
      const context = createErrorContext({
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
        headers: request.headers as Record<string, string | string[] | undefined>
      });
      loggers.api.error({ error, context }, 'Failed to create user');
      
      if (error instanceof ValidationError) {
        reply.code(400).send(formatErrorResponse(error));
      } else {
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
   * PUT /users/:id - Update user (with optional profile picture upload)
   */
  fastify.put<{
    Params: { id: string };
  }>('/users/:id', {
    preHandler: [authenticate, requireResourceOwnership('id')],
    schema: {
      params: Type.Object({
        id: UUIDSchema
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          data: UserResponseSchema,
          timestamp: Type.String({ format: 'date-time' })
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      let updateData: any = {};
      let profilePictureFile: any = null;

      // Check if request is multipart (contains file upload)
      const contentType = request.headers['content-type'] || '';
      const isMultipart = contentType.includes('multipart/form-data');

      if (isMultipart) {
        // Handle multipart form data with potential file upload
        const parts = request.parts();
        
        for await (const part of parts) {
          if (part.type === 'file' && part.fieldname === 'profilePicture') {
            // Validate file size and type
            const buffer = await part.toBuffer();
            const fileSize = buffer.length;
            const contentType = part.mimetype;
            const fileName = part.filename || 'profile-picture';

            // Validate image file with buffer analysis
            const validation = cloudinaryProfileService.validateProfilePictureWithBuffer(fileName, contentType, buffer);
            if (!validation.valid) {
              throw new ValidationError(`Profile picture validation failed: ${validation.error}`, [
                { field: 'profilePicture', message: validation.error || 'Invalid profile picture' }
              ]);
            }

            profilePictureFile = {
              buffer,
              fileName,
              contentType,
              fileSize
            };
          } else if (part.type === 'field') {
            // Parse form fields
            const value = (part as any).value;
            try {
              // Try to parse as JSON if it looks like JSON
              updateData[part.fieldname] = value.startsWith('{') || value.startsWith('[') ? JSON.parse(value) : value;
            } catch {
              updateData[part.fieldname] = value;
            }
          }
        }
      } else {
        // Handle regular JSON body
        updateData = request.body as any;
      }

      // Handle profile picture upload if provided
      if (profilePictureFile) {
        const organizationId = (request.user as any)?.organizationId;
        
        const uploadResult = await cloudinaryProfileService.uploadProfilePicture({
          userId: id,
          organizationId,
          buffer: profilePictureFile.buffer,
          fileName: profilePictureFile.fileName,
          contentType: profilePictureFile.contentType,
          fileSize: profilePictureFile.fileSize,
          description: 'Profile Picture Upload'
        });

        if (uploadResult.success) {
          loggers.api.info({
            userId: request.user?.userId,
            targetUserId: id,
            fileName: profilePictureFile.fileName,
            fileSize: `${Math.round(profilePictureFile.fileSize / 1024)}KB`,
            avatarUrl: uploadResult.avatarUrl
          }, 'Profile picture uploaded to Cloudinary during profile update');

          // Return the updated user from the upload result instead of updating separately
          if (uploadResult.user) {
            reply.send({
              success: true,
              data: uploadResult.user,
              timestamp: new Date().toISOString()
            });
            return;
          }
        } else {
          throw new Error(`Profile picture upload failed: ${uploadResult.error}`);
        }
      }

      // Update user profile data using cached service (will evict cache)
      const user = await userService.updateUser(id, updateData);

      loggers.api.info({
        userId: request.user?.userId,
        updatedUserId: id,
        updatedFields: Object.keys(updateData),
        profilePictureUploaded: !!profilePictureFile
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

    } catch (error) {
      const context = createErrorContext({
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
        headers: request.headers as Record<string, string | string[] | undefined>
      });
      loggers.api.error({ error, context }, 'Failed to update user');
      
      if (error instanceof NotFoundError) {
        reply.code(404).send(formatErrorResponse(error));
      } else if (error instanceof ValidationError) {
        reply.code(400).send(formatErrorResponse(error));
      } else {
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
  fastify.post<{
    Params: { id: string };
    Body: typeof ChangePasswordSchema.static
  }>('/users/:id/change-password', {
    preHandler: [authenticate, requireResourceOwnership('id')],
    schema: {
      params: Type.Object({
        id: UUIDSchema
      }),
      body: ChangePasswordSchema,
      response: {
        200: SuccessResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { currentPassword, newPassword } = request.body;

      // Verify current password
      const user = await userRepository.findById(id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const isCurrentPasswordValid = await userRepository.verifyPassword(user.email, currentPassword);
      if (!isCurrentPasswordValid) {
        throw new ValidationError('Current password is incorrect', [
          { field: 'currentPassword', message: 'Invalid password' }
        ]);
      }

      // Update password
      const success = await userRepository.updatePassword(id, newPassword);
      if (!success) {
        throw new Error('Failed to update password');
      }

      // Clear user cache
      await cacheService.users.delete(CacheKeyUtils.userKey(id));

      loggers.api.info({
        userId: request.user?.userId,
        targetUserId: id
      }, 'Password changed successfully');

      reply.send({
        success: true,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const context = createErrorContext({
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
        headers: request.headers as Record<string, string | string[] | undefined>
      });
      loggers.api.error({ error, context }, 'Failed to change password');
      
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        reply.code(400).send(formatErrorResponse(error));
      } else {
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
  fastify.delete<{
    Params: { id: string }
  }>('/users/:id', {
    preHandler: [authenticate, authorizeRoles('ceo')],
    schema: {
      params: Type.Object({
        id: UUIDSchema
      }),
      response: {
        200: SuccessResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Prevent self-deletion
      if (id === request.user?.userId) {
        throw new ValidationError('Cannot delete your own account', [
          { field: 'userId', message: 'Self-deletion not allowed' }
        ]);
      }

      const success = await userRepository.softDelete(id, request.user!.userId);
      if (!success) {
        throw new NotFoundError('User not found');
      }

      // Clear user cache
      await cacheService.users.delete(CacheKeyUtils.userKey(id));

      loggers.api.info({
        userId: request.user?.userId,
        deletedUserId: id
      }, 'User deleted successfully');

      reply.send({
        success: true,
        message: 'User deleted successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const context = createErrorContext({
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
        headers: request.headers as Record<string, string | string[] | undefined>
      });
      loggers.api.error({ error, context }, 'Failed to delete user');
      
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        reply.code(400).send(formatErrorResponse(error));
      } else {
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
  fastify.get<{
    Params: { id: string }
  }>('/users/:id/stats', {
    preHandler: [authenticate, authorizeRoles('ceo', 'manager')],
    schema: {
      params: Type.Object({
        id: UUIDSchema
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          data: Type.Object({
            userId: UUIDSchema,
            taskStats: Type.Object({
              total: Type.Integer(),
              completed: Type.Integer(),
              inProgress: Type.Integer(),
              overdue: Type.Integer(),
            }),
            channelStats: Type.Object({
              memberships: Type.Integer(),
              messagesCount: Type.Integer(),
            }),
            activityStats: Type.Object({
              lastActive: Type.Optional(Type.String({ format: 'date-time' })),
              totalSessions: Type.Integer(),
              avgSessionDuration: Type.Number(),
            }),
          }),
          timestamp: Type.String({ format: 'date-time' })
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      // Get user stats from repositories
      const [user, taskStats] = await Promise.all([
        userRepository.findById(id),
        // taskRepository.getTaskStats(id), // TODO: Implement
        Promise.resolve({
          total: 0,
          completed: 0,
          inProgress: 0,
          overdue: 0,
        })
      ]);

      if (!user) {
        throw new NotFoundError('User not found');
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

      loggers.api.info({
        userId: request.user?.userId,
        requestedUserId: id
      }, 'User stats retrieved');

      reply.send({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const context = createErrorContext({
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
        headers: request.headers as Record<string, string | string[] | undefined>
      });
      loggers.api.error({ error, context }, 'Failed to get user stats');
      
      if (error instanceof NotFoundError) {
        reply.code(404).send(formatErrorResponse(error));
      } else {
        reply.code(500).send({
          error: {
            message: 'Failed to get user stats',
            code: 'SERVER_ERROR'
          }
        });
      }
    }
  });

  /**
   * POST /users/:id/profile-picture - Upload profile picture
   */
  fastify.post<{
    Params: { id: string };
    Body: typeof ProfilePictureUploadSchema.static
  }>('/users/:id/profile-picture', {
    preHandler: [authenticate, requireResourceOwnership('id'), apiRateLimit],
    schema: {
      params: Type.Object({
        id: UUIDSchema
      }),
      body: ProfilePictureUploadSchema,
      response: {
        200: ProfilePictureUploadResponseSchema,
        400: Type.Object({
          error: Type.Object({
            message: Type.String(),
            code: Type.String(),
            details: Type.Optional(Type.Array(Type.Object({
              field: Type.String(),
              message: Type.String(),
              value: Type.Optional(Type.Any())
            })))
          })
        }),
        404: Type.Object({
          error: Type.Object({
            message: Type.String(),
            code: Type.String()
          })
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { fileName, contentType, fileSize, description } = request.body;

      // Verify user exists
      const user = await userService.getUserById(id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Get organization ID from user context (assuming it exists)
      // Note: This should be added to the TokenPayload interface if not present
      const organizationId = (request.user as any)?.organizationId || 'default-org';

      // Initiate profile picture upload
      const uploadResult = await profilePictureService.initiateProfilePictureUpload({
        userId: id,
        organizationId,
        fileName,
        contentType,
        fileSize,
        description
      });

      if (!uploadResult.success) {
        throw new ValidationError(uploadResult.error || 'Failed to initiate profile picture upload', [
          { field: 'profilePicture', message: uploadResult.error || 'Upload initiation failed' }
        ]);
      }

      loggers.api.info({
        userId: request.user?.userId,
        targetUserId: id,
        fileName,
        fileSize: `${Math.round(fileSize / 1024)}KB`,
        processingTime: `${uploadResult.processingTime.toFixed(2)}ms`
      }, 'Profile picture upload initiated');

      reply.send({
        success: true,
        data: {
          uploadUrl: uploadResult.uploadUrl!,
          downloadUrl: uploadResult.downloadUrl,
          fileId: uploadResult.fileId!,
          expiresAt: uploadResult.expiresAt!.toISOString()
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const context = createErrorContext({
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
        headers: request.headers as Record<string, string | string[] | undefined>
      });
      loggers.api.error({ error, context }, 'Failed to initiate profile picture upload');
      
      if (error instanceof NotFoundError) {
        reply.code(404).send(formatErrorResponse(error));
      } else if (error instanceof ValidationError) {
        reply.code(400).send(formatErrorResponse(error));
      } else {
        reply.code(500).send({
          error: {
            message: 'Failed to initiate profile picture upload',
            code: 'SERVER_ERROR'
          }
        });
      }
    }
  });

  /**
   * POST /users/:id/profile-picture/complete - Complete profile picture upload
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      fileId: string;
      success: boolean;
      error?: string;
    }
  }>('/users/:id/profile-picture/complete', {
    preHandler: [authenticate, requireResourceOwnership('id')],
    schema: {
      params: Type.Object({
        id: UUIDSchema
      }),
      body: Type.Object({
        fileId: Type.String(),
        success: Type.Boolean(),
        error: Type.Optional(Type.String())
      }),
      response: {
        200: SuccessResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { fileId, success, error } = request.body;

      const completionResult = await profilePictureService.completeProfilePictureUpload(
        fileId,
        id,
        success,
        error
      );

      if (!completionResult) {
        throw new Error('Failed to complete profile picture upload');
      }

      // Clear user cache
      await cacheService.users.delete(CacheKeyUtils.userKey(id));

      loggers.api.info({
        userId: request.user?.userId,
        targetUserId: id,
        fileId,
        success,
        error
      }, 'Profile picture upload completed');

      reply.send({
        success: true,
        message: success ? 'Profile picture updated successfully' : 'Profile picture upload failed',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const context = createErrorContext({
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
        headers: request.headers as Record<string, string | string[] | undefined>
      });
      loggers.api.error({ error, context }, 'Failed to complete profile picture upload');
      
      reply.code(500).send({
        error: {
          message: 'Failed to complete profile picture upload',
          code: 'SERVER_ERROR'
        }
      });
    }
  });

  /**
   * DELETE /users/:id/profile-picture - Delete profile picture
   */
  fastify.delete<{
    Params: { id: string }
  }>('/users/:id/profile-picture', {
    preHandler: [authenticate, requireResourceOwnership('id')],
    schema: {
      params: Type.Object({
        id: UUIDSchema
      }),
      response: {
        200: SuccessResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const deleteResult = await cloudinaryProfileService.deleteProfilePicture(id);

      if (!deleteResult.success) {
        throw new Error(deleteResult.error || 'Failed to delete profile picture');
      }

      // Clear user cache
      await cacheService.users.delete(CacheKeyUtils.userKey(id));

      loggers.api.info({
        userId: request.user?.userId,
        targetUserId: id
      }, 'Profile picture deleted successfully from Cloudinary');

      reply.send({
        success: true,
        data: deleteResult.user,
        message: 'Profile picture deleted successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const context = createErrorContext({
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
        headers: request.headers as Record<string, string | string[] | undefined>
      });
      loggers.api.error({ error, context }, 'Failed to delete profile picture');
      
      reply.code(500).send({
        error: {
          message: 'Failed to delete profile picture',
          code: 'SERVER_ERROR'
        }
      });
    }
  });
};