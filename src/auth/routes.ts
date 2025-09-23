import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { jwtService } from './jwt';
import { userRepository } from '@db/index';
import { logger, securityLogger } from '@utils/logger';
import {
  AuthenticationError,
  ValidationError,
  ConflictError,
  createErrorContext,
  formatErrorResponse,
} from '@utils/errors';
import { authRateLimit } from './middleware';
import { Type, Static } from '@sinclair/typebox';
import crypto from 'crypto';
import { emailService } from '@/services/EmailService';

/**
 * Authentication routes for the CEO Communication Platform
 * Includes login, registration, password reset, and token management
 */

// Request/Response schemas
const LoginSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 1 }),
});

const RegisterSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
  name: Type.String({ minLength: 1, maxLength: 255 }),
  role: Type.Union([Type.Literal('ceo'), Type.Literal('manager'), Type.Literal('staff')]),
  department: Type.Optional(Type.String()),
  job_title: Type.Optional(Type.String()),
  phone: Type.Optional(Type.String()),
});

const RefreshTokenSchema = Type.Object({
  refreshToken: Type.String(),
});

const PasswordResetRequestSchema = Type.Object({
  email: Type.String({ format: 'email' }),
});

const PasswordResetSchema = Type.Object({
  token: Type.String(),
  newPassword: Type.String({ minLength: 8 }),
});

const ChangePasswordSchema = Type.Object({
  currentPassword: Type.String(),
  newPassword: Type.String({ minLength: 8 }),
});

type LoginRequest = Static<typeof LoginSchema>;
type RegisterRequest = Static<typeof RegisterSchema>;
type RefreshTokenRequest = Static<typeof RefreshTokenSchema>;
type PasswordResetRequestRequest = Static<typeof PasswordResetRequestSchema>;
type PasswordResetRequest = Static<typeof PasswordResetSchema>;

/**
 * Register authentication routes
 */
export const registerAuthRoutes = async (fastify: FastifyInstance) => {
  /**
   * POST /auth/login - User login
   */
  fastify.post<{ Body: LoginRequest }>(
    '/auth/login',
    {
      preHandler: [authRateLimit],
      schema: {
        tags: ['Authentication'],
        summary: 'User Login',
        description: 'Authenticate user with email and password to receive JWT tokens',
        body: LoginSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              accessToken: Type.String(),
              refreshToken: Type.String(),
              expiresIn: Type.Number(),
              user: Type.Object({
                id: Type.String(),
                email: Type.String(),
                name: Type.String(),
                role: Type.String(),
                avatar_url: Type.Optional(Type.String()),
                email_verified: Type.Boolean(),
                permissions: Type.Array(Type.String()),
              }),
            }),
          }),
          400: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
          401: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
      const { email, password } = request.body;
      const context = createErrorContext({
        ip: request.ip,
        method: request.method,
        url: request.url,
        headers: request.headers as Record<string, string | string[] | undefined>,
        ...(request.user && {
          user: {
            id: request.user.id,
            email: request.user.email,
            role: request.user.role,
          },
        }),
      });

      try {
        securityLogger.logAuthEvent('login_attempt', {
          email,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
        });

        // Verify credentials
        const user = await userRepository.verifyPassword(email, password);

        if (!user) {
          securityLogger.logAuthEvent('failed_login', {
            email,
            ip: request.ip,
            reason: 'invalid_credentials',
          });

          throw new AuthenticationError('Invalid email or password');
        }

        // Log if user is not verified (but don't prevent login)
        if (!user.email_verified) {
          securityLogger.logAuthEvent('login_attempt', {
            email,
            ip: request.ip,
            reason: 'email_not_verified',
          });
        }

        // Generate tokens
        const tokens = await jwtService.generateTokens({
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
        });

        securityLogger.logAuthEvent('login', {
          userId: user.id,
          email: user.email,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
        });

        const responseData = {
          success: true,
          data: {
            ...tokens,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              avatar_url: user.avatar_url,
              email_verified: user.email_verified,
              permissions: jwtService.decodeToken(tokens.accessToken)?.permissions || [],
            },
          },
        };
        
        logger.info({ 
          responseData: JSON.stringify(responseData).substring(0, 200) + '...', 
          contentLength: JSON.stringify(responseData).length,
          userId: user.id 
        }, 'Sending login response');
        
        reply.code(200).send(responseData);
      } catch (error) {
        logger.error({ error, context }, 'Login failed');

        if (error instanceof AuthenticationError || error instanceof ValidationError) {
          reply.code(401).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Login failed due to server error',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * POST /auth/register - User registration
   */
  fastify.post<{ Body: RegisterRequest }>(
    '/auth/register',
    {
      preHandler: [authRateLimit],
      schema: {
        tags: ['Authentication'],
        summary: 'User Registration',
        description: 'Register a new user account with email verification',
        body: RegisterSchema,
        response: {
          201: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              user: Type.Object({
                id: Type.String(),
                email: Type.String(),
                name: Type.String(),
                role: Type.String(),
              }),
              message: Type.String(),
            }),
          }),
          400: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
          409: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request: FastifyRequest<{ Body: RegisterRequest }>, reply: FastifyReply) => {
      const userData = request.body;
      const context = createErrorContext({
        ip: request.ip,
        method: request.method,
        url: request.url,
        headers: request.headers as Record<string, string | string[] | undefined>,
        ...(request.user && {
          user: {
            id: request.user.id,
            email: request.user.email,
            role: request.user.role,
          },
        }),
      });

      try {
        securityLogger.logAuthEvent('registration_attempt', {
          email: userData.email,
          role: userData.role,
          ip: request.ip,
        });

        // Create user
        const user = await userRepository.createUser({
          ...userData,
          // Self-registration: do not set created_by
        });

        // Generate email verification token
        const verificationToken = jwtService.generateEmailVerificationToken(user.id, user.email);
        await userRepository.setEmailVerificationToken(user.id, verificationToken);

        // Send welcome and verification emails
        const [welcomeEmailSent, verificationEmailSent] = await Promise.all([
          emailService.sendWelcomeEmail({
            userEmail: user.email,
            userName: user.name,
            role: user.role,
          }),
          emailService.sendEmailVerification({
            userEmail: user.email,
            userName: user.name,
            verificationToken,
          })
        ]);

        if (!welcomeEmailSent) {
          logger.warn({ userId: user.id, email: user.email }, 'Failed to send welcome email');
        }
        if (!verificationEmailSent) {
          logger.warn({ userId: user.id, email: user.email }, 'Failed to send verification email');
        }

        securityLogger.logAuthEvent('registration_success', {
          userId: user.id,
          email: user.email,
          role: user.role,
          ip: request.ip,
          welcomeEmailSent,
          verificationEmailSent,
        });

        reply.code(201).send({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
            },
            message:
              'Account created successfully. Please check your email for verification instructions.',
          },
        });
      } catch (error) {
        logger.error({ error, context }, 'Registration failed');

        if (error instanceof ConflictError) {
          reply.code(409).send(formatErrorResponse(error));
        } else if (error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Registration failed due to server error',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * POST /auth/refresh - Refresh access token
   */
  fastify.post<{ Body: RefreshTokenRequest }>(
    '/auth/refresh',
    {
      schema: {
        body: RefreshTokenSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              accessToken: Type.String(),
              refreshToken: Type.String(),
              expiresIn: Type.Number(),
            }),
          }),
          401: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request: FastifyRequest<{ Body: RefreshTokenRequest }>, reply: FastifyReply) => {
      const { refreshToken } = request.body;
      const context = createErrorContext({
        ip: request.ip,
        method: request.method,
        url: request.url,
        headers: request.headers as Record<string, string | string[] | undefined>,
        ...(request.user && {
          user: {
            id: request.user.id,
            email: request.user.email,
            role: request.user.role,
          },
        }),
      });

      try {
        const tokens = await jwtService.refreshTokens(refreshToken);

        reply.code(200).send({
          success: true,
          data: tokens,
        });
      } catch (error) {
        logger.error({ error, context }, 'Token refresh failed');

        if (error instanceof AuthenticationError) {
          reply.code(401).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Token refresh failed',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * POST /auth/logout - User logout (invalidate tokens - would need Redis blacklist in production)
   */
  fastify.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    // In production, add token to blacklist in Redis
    // For now, just log the logout

    if (request.user) {
      securityLogger.logAuthEvent('logout', {
        userId: request.user.userId,
        ip: request.ip,
      });
    }

    reply.code(200).send({
      success: true,
      message: 'Logged out successfully',
    });
  });

  /**
   * POST /auth/password-reset-request - Request password reset
   */
  fastify.post<{ Body: PasswordResetRequestRequest }>(
    '/auth/password-reset-request',
    {
      preHandler: [authRateLimit],
      schema: {
        body: PasswordResetRequestSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
          }),
        },
      },
    },
    async (request: FastifyRequest<{ Body: PasswordResetRequestRequest }>, reply: FastifyReply) => {
      const { email } = request.body;

      try {
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');

        // Save token (expires in 1 hour)
        const tokenSet = await userRepository.setPasswordResetToken(email, resetToken, '1 hour');

        if (tokenSet) {
          // Get user details for the email
          const user = await userRepository.findByEmail(email);

          if (user) {
            // Send password reset email
            const emailSent = await emailService.sendPasswordReset({
              userEmail: user.email,
              userName: user.name,
              resetToken,
            });

            if (!emailSent) {
              logger.warn({ email, userId: user.id }, 'Failed to send password reset email');
            }

            securityLogger.logAuthEvent('password_reset_requested', {
              email,
              userId: user.id,
              ip: request.ip,
              emailSent,
            });
          }

          logger.info({ email, resetToken }, 'Password reset token generated');
        }

        // Always return success (don't reveal if email exists)
        reply.code(200).send({
          success: true,
          message: 'If the email address exists, you will receive password reset instructions.',
        });
      } catch (error) {
        logger.error({ error, email }, 'Password reset request failed');

        // Still return success to prevent email enumeration
        reply.code(200).send({
          success: true,
          message: 'If the email address exists, you will receive password reset instructions.',
        });
      }
    }
  );

  /**
   * POST /auth/password-reset - Reset password with token
   */
  fastify.post<{ Body: PasswordResetRequest }>(
    '/auth/password-reset',
    {
      preHandler: [authRateLimit],
      schema: {
        body: PasswordResetSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
          }),
          400: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request: FastifyRequest<{ Body: PasswordResetRequest }>, reply: FastifyReply) => {
      const { token, newPassword } = request.body;
      const context = createErrorContext({
        ip: request.ip,
        method: request.method,
        url: request.url,
        headers: request.headers as Record<string, string | string[] | undefined>,
        ...(request.user &&
        typeof request.user === 'object' &&
        'email' in request.user &&
        'role' in request.user
          ? {
              user: {
                id: request.user.id,
                email: (request.user as any).email,
                role: (request.user as any).role,
              },
            }
          : {}),
      });

      try {
        // Verify token
        const user = await userRepository.verifyPasswordResetToken(token);

        if (!user) {
          throw new AuthenticationError('Invalid or expired password reset token');
        }

        // Update password
        const success = await userRepository.updatePassword(user.id, newPassword);

        if (!success) {
          throw new ValidationError('Failed to update password', []);
        }

        securityLogger.logAuthEvent('password_reset', {
          userId: user.id,
          email: user.email,
          ip: request.ip,
        });

        reply.code(200).send({
          success: true,
          message:
            'Password has been reset successfully. You can now log in with your new password.',
        });
      } catch (error) {
        logger.error({ error, context }, 'Password reset failed');

        if (error instanceof AuthenticationError || error instanceof ValidationError) {
          reply.code(400).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Password reset failed',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * GET /auth/verify-email/:token - Verify email address
   */
  fastify.get<{ Params: { token: string } }>(
    '/auth/verify-email/:token',
    async (request, reply) => {
      const { token } = request.params;

      try {
        const user = await userRepository.verifyEmail(token);

        if (!user) {
          throw new AuthenticationError('Invalid or expired email verification token');
        }

        securityLogger.logAuthEvent('email_verified', {
          userId: user.id,
          email: user.email,
          ip: request.ip,
        });

        reply.code(200).send({
          success: true,
          message: 'Email address verified successfully. You can now log in.',
        });
      } catch (error) {
        logger.error({ error, token }, 'Email verification failed');

        reply.code(400).send({
          error: {
            message: 'Invalid or expired verification token',
            code: 'INVALID_TOKEN',
          },
        });
      }
    }
  );

  /**
   * GET /auth/me - Get current user profile
   */
  fastify.get(
    '/auth/me',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Authentication'],
        summary: 'Get Current User',
        description: 'Get the profile information of the currently authenticated user',
        security: [{ BearerAuth: [] }],
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              user: Type.Object({
                id: Type.String({ format: 'uuid' }),
                email: Type.String({ format: 'email' }),
                name: Type.String(),
                role: Type.String({ enum: ['ceo', 'manager', 'staff'] }),
                avatar_url: Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
                department: Type.Union([Type.String(), Type.Null()]),
                job_title: Type.Union([Type.String(), Type.Null()]),
                phone: Type.Union([Type.String(), Type.Null()]),
                language_preference: Type.Union([Type.String(), Type.Null()]),
                timezone: Type.Union([Type.String(), Type.Null()]),
                notification_settings: Type.Any(),
                voice_settings: Type.Any(),
                email_verified: Type.Boolean(),
                last_active: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
                created_at: Type.String({ format: 'date-time' }),
                updated_at: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
                permissions: Type.Array(Type.String()),
              }),
            }),
          }),
          401: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        throw new AuthenticationError('Authentication required');
      }

      try {
        const user = await userRepository.findById(request.user.userId);

        if (!user) {
          throw new AuthenticationError('User not found');
        }

        reply.code(200).send({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              avatar_url: user.avatar_url,
              department: user.department,
              job_title: user.job_title,
              phone: user.phone,
              language_preference: user.language_preference,
              timezone: user.timezone,
              notification_settings: user.notification_settings,
              voice_settings: user.voice_settings,
              email_verified: user.email_verified,
              last_active: user.last_active,
              created_at: user.created_at,
              updated_at: user.updated_at,
              permissions: request.user.permissions,
            },
          },
        });
      } catch (error) {
        logger.error({ error, userId: request.user.userId }, 'Get profile failed');

        if (error instanceof AuthenticationError) {
          reply.code(401).send(formatErrorResponse(error));
        } else {
          reply.code(500).send({
            error: {
              message: 'Failed to get user profile',
              code: 'SERVER_ERROR',
            },
          });
        }
      }
    }
  );

  /**
   * POST /auth/resend-verification - Resend email verification
   */
  fastify.post<{ Body: { email: string } }>(
    '/auth/resend-verification',
    {
      preHandler: [authRateLimit],
      schema: {
        tags: ['Authentication'],
        summary: 'Resend Email Verification',
        description: 'Resend email verification link to the specified email address',
        body: Type.Object({
          email: Type.String({ format: 'email' }),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
          }),
          400: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request: FastifyRequest<{ Body: { email: string } }>, reply: FastifyReply) => {
      const { email } = request.body;
      const context = createErrorContext({
        ip: request.ip,
        method: request.method,
        url: request.url,
        headers: request.headers as Record<string, string | string[] | undefined>,
      });

      try {
        // Check if user exists with this email
        const user = await userRepository.findByEmail(email);
        
        if (!user) {
          // Don't reveal that the email doesn't exist for security reasons
          reply.code(200).send({
            success: true,
            message: 'If the email address exists, a new verification email will be sent.',
          });
          return;
        }

        // Check if user is already verified
        if (user.email_verified) {
          reply.code(200).send({
            success: true,
            message: 'Email address is already verified.',
          });
          return;
        }

        // Generate new email verification token
        const verificationToken = jwtService.generateEmailVerificationToken(user.id, user.email);
        await userRepository.setEmailVerificationToken(user.id, verificationToken);

        // Send verification link resend email
        const emailSent = await emailService.sendVerificationLinkResend({
          userEmail: user.email,
          userName: user.name,
          verificationToken,
        });

        if (!emailSent) {
          logger.warn({ userId: user.id, email: user.email }, 'Failed to send verification email');
        }

        securityLogger.logAuthEvent('email_verified', {
          userId: user.id,
          email: user.email,
          ip: request.ip,
          emailSent,
        });

        reply.code(200).send({
          success: true,
          message: 'Verification email sent successfully. Please check your inbox and spam folder.',
        });
      } catch (error) {
        logger.error({ error, context, email }, 'Resend verification failed');

        reply.code(500).send({
          error: {
            message: 'Failed to resend verification email',
            code: 'SERVER_ERROR',
          },
        });
      }
    }
  );
};
