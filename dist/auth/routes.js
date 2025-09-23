"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuthRoutes = void 0;
const jwt_1 = require("./jwt");
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
const errors_1 = require("@utils/errors");
const middleware_1 = require("./middleware");
const typebox_1 = require("@sinclair/typebox");
const crypto_1 = __importDefault(require("crypto"));
const EmailService_1 = require("@/services/EmailService");
/**
 * Authentication routes for the CEO Communication Platform
 * Includes login, registration, password reset, and token management
 */
// Request/Response schemas
const LoginSchema = typebox_1.Type.Object({
    email: typebox_1.Type.String({ format: 'email' }),
    password: typebox_1.Type.String({ minLength: 1 }),
});
const RegisterSchema = typebox_1.Type.Object({
    email: typebox_1.Type.String({ format: 'email' }),
    password: typebox_1.Type.String({ minLength: 8 }),
    name: typebox_1.Type.String({ minLength: 1, maxLength: 255 }),
    role: typebox_1.Type.Union([typebox_1.Type.Literal('ceo'), typebox_1.Type.Literal('manager'), typebox_1.Type.Literal('staff')]),
    department: typebox_1.Type.Optional(typebox_1.Type.String()),
    job_title: typebox_1.Type.Optional(typebox_1.Type.String()),
    phone: typebox_1.Type.Optional(typebox_1.Type.String()),
});
const RefreshTokenSchema = typebox_1.Type.Object({
    refreshToken: typebox_1.Type.String(),
});
const PasswordResetRequestSchema = typebox_1.Type.Object({
    email: typebox_1.Type.String({ format: 'email' }),
});
const PasswordResetSchema = typebox_1.Type.Object({
    token: typebox_1.Type.String(),
    newPassword: typebox_1.Type.String({ minLength: 8 }),
});
const ChangePasswordSchema = typebox_1.Type.Object({
    currentPassword: typebox_1.Type.String(),
    newPassword: typebox_1.Type.String({ minLength: 8 }),
});
/**
 * Register authentication routes
 */
const registerAuthRoutes = async (fastify) => {
    /**
     * POST /auth/login - User login
     */
    fastify.post('/auth/login', {
        preHandler: [middleware_1.authRateLimit],
        schema: {
            tags: ['Authentication'],
            summary: 'User Login',
            description: 'Authenticate user with email and password to receive JWT tokens',
            body: LoginSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        accessToken: typebox_1.Type.String(),
                        refreshToken: typebox_1.Type.String(),
                        expiresIn: typebox_1.Type.Number(),
                        user: typebox_1.Type.Object({
                            id: typebox_1.Type.String(),
                            email: typebox_1.Type.String(),
                            name: typebox_1.Type.String(),
                            role: typebox_1.Type.String(),
                            avatar_url: typebox_1.Type.Optional(typebox_1.Type.String()),
                            email_verified: typebox_1.Type.Boolean(),
                            permissions: typebox_1.Type.Array(typebox_1.Type.String()),
                        }),
                    }),
                }),
                400: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
                401: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        const { email, password } = request.body;
        const context = (0, errors_1.createErrorContext)({
            ip: request.ip,
            method: request.method,
            url: request.url,
            headers: request.headers,
            ...(request.user && {
                user: {
                    id: request.user.id,
                    email: request.user.email,
                    role: request.user.role,
                },
            }),
        });
        try {
            logger_1.securityLogger.logAuthEvent('login_attempt', {
                email,
                ip: request.ip,
                userAgent: request.headers['user-agent'] ?? '',
            });
            // Verify credentials
            const user = await index_1.userRepository.verifyPassword(email, password);
            if (!user) {
                logger_1.securityLogger.logAuthEvent('failed_login', {
                    email,
                    ip: request.ip,
                    reason: 'invalid_credentials',
                });
                throw new errors_1.AuthenticationError('Invalid email or password');
            }
            // Log if user is not verified (but don't prevent login)
            if (!user.email_verified) {
                logger_1.securityLogger.logAuthEvent('login_attempt', {
                    email,
                    ip: request.ip,
                    reason: 'email_not_verified',
                });
            }
            // Generate tokens
            const tokens = await jwt_1.jwtService.generateTokens({
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name,
            });
            logger_1.securityLogger.logAuthEvent('login', {
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
                        permissions: jwt_1.jwtService.decodeToken(tokens.accessToken)?.permissions || [],
                    },
                },
            };
            logger_1.logger.info({
                responseData: JSON.stringify(responseData).substring(0, 200) + '...',
                contentLength: JSON.stringify(responseData).length,
                userId: user.id
            }, 'Sending login response');
            reply.code(200).send(responseData);
        }
        catch (error) {
            logger_1.logger.error({ error, context }, 'Login failed');
            if (error instanceof errors_1.AuthenticationError || error instanceof errors_1.ValidationError) {
                reply.code(401).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Login failed due to server error',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /auth/register - User registration
     */
    fastify.post('/auth/register', {
        preHandler: [middleware_1.authRateLimit],
        schema: {
            tags: ['Authentication'],
            summary: 'User Registration',
            description: 'Register a new user account with email verification',
            body: RegisterSchema,
            response: {
                201: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        user: typebox_1.Type.Object({
                            id: typebox_1.Type.String(),
                            email: typebox_1.Type.String(),
                            name: typebox_1.Type.String(),
                            role: typebox_1.Type.String(),
                        }),
                        message: typebox_1.Type.String(),
                    }),
                }),
                400: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
                409: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        const userData = request.body;
        const context = (0, errors_1.createErrorContext)({
            ip: request.ip,
            method: request.method,
            url: request.url,
            headers: request.headers,
            ...(request.user && {
                user: {
                    id: request.user.id,
                    email: request.user.email,
                    role: request.user.role,
                },
            }),
        });
        try {
            logger_1.securityLogger.logAuthEvent('registration_attempt', {
                email: userData.email,
                role: userData.role,
                ip: request.ip,
            });
            // Create user
            const user = await index_1.userRepository.createUser({
                ...userData,
                // Self-registration: do not set created_by
            });
            // Generate email verification token
            const verificationToken = jwt_1.jwtService.generateEmailVerificationToken(user.id, user.email);
            await index_1.userRepository.setEmailVerificationToken(user.id, verificationToken);
            // Send welcome and verification emails
            const [welcomeEmailSent, verificationEmailSent] = await Promise.all([
                EmailService_1.emailService.sendWelcomeEmail({
                    userEmail: user.email,
                    userName: user.name,
                    role: user.role,
                }),
                EmailService_1.emailService.sendEmailVerification({
                    userEmail: user.email,
                    userName: user.name,
                    verificationToken,
                })
            ]);
            if (!welcomeEmailSent) {
                logger_1.logger.warn({ userId: user.id, email: user.email }, 'Failed to send welcome email');
            }
            if (!verificationEmailSent) {
                logger_1.logger.warn({ userId: user.id, email: user.email }, 'Failed to send verification email');
            }
            logger_1.securityLogger.logAuthEvent('registration_success', {
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
                    message: 'Account created successfully. Please check your email for verification instructions.',
                },
            });
        }
        catch (error) {
            logger_1.logger.error({ error, context }, 'Registration failed');
            if (error instanceof errors_1.ConflictError) {
                reply.code(409).send((0, errors_1.formatErrorResponse)(error));
            }
            else if (error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Registration failed due to server error',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /auth/refresh - Refresh access token
     */
    fastify.post('/auth/refresh', {
        schema: {
            body: RefreshTokenSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        accessToken: typebox_1.Type.String(),
                        refreshToken: typebox_1.Type.String(),
                        expiresIn: typebox_1.Type.Number(),
                    }),
                }),
                401: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        const { refreshToken } = request.body;
        const context = (0, errors_1.createErrorContext)({
            ip: request.ip,
            method: request.method,
            url: request.url,
            headers: request.headers,
            ...(request.user && {
                user: {
                    id: request.user.id,
                    email: request.user.email,
                    role: request.user.role,
                },
            }),
        });
        try {
            const tokens = await jwt_1.jwtService.refreshTokens(refreshToken);
            reply.code(200).send({
                success: true,
                data: tokens,
            });
        }
        catch (error) {
            logger_1.logger.error({ error, context }, 'Token refresh failed');
            if (error instanceof errors_1.AuthenticationError) {
                reply.code(401).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Token refresh failed',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /auth/logout - User logout (invalidate tokens - would need Redis blacklist in production)
     */
    fastify.post('/auth/logout', async (request, reply) => {
        // In production, add token to blacklist in Redis
        // For now, just log the logout
        if (request.user) {
            logger_1.securityLogger.logAuthEvent('logout', {
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
    fastify.post('/auth/password-reset-request', {
        preHandler: [middleware_1.authRateLimit],
        schema: {
            body: PasswordResetRequestSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    message: typebox_1.Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const { email } = request.body;
        try {
            // Generate reset token
            const resetToken = crypto_1.default.randomBytes(32).toString('hex');
            // Save token (expires in 1 hour)
            const tokenSet = await index_1.userRepository.setPasswordResetToken(email, resetToken, '1 hour');
            if (tokenSet) {
                // Get user details for the email
                const user = await index_1.userRepository.findByEmail(email);
                if (user) {
                    // Send password reset email
                    const emailSent = await EmailService_1.emailService.sendPasswordReset({
                        userEmail: user.email,
                        userName: user.name,
                        resetToken,
                    });
                    if (!emailSent) {
                        logger_1.logger.warn({ email, userId: user.id }, 'Failed to send password reset email');
                    }
                    logger_1.securityLogger.logAuthEvent('password_reset_requested', {
                        email,
                        userId: user.id,
                        ip: request.ip,
                        emailSent,
                    });
                }
                logger_1.logger.info({ email, resetToken }, 'Password reset token generated');
            }
            // Always return success (don't reveal if email exists)
            reply.code(200).send({
                success: true,
                message: 'If the email address exists, you will receive password reset instructions.',
            });
        }
        catch (error) {
            logger_1.logger.error({ error, email }, 'Password reset request failed');
            // Still return success to prevent email enumeration
            reply.code(200).send({
                success: true,
                message: 'If the email address exists, you will receive password reset instructions.',
            });
        }
    });
    /**
     * POST /auth/password-reset - Reset password with token
     */
    fastify.post('/auth/password-reset', {
        preHandler: [middleware_1.authRateLimit],
        schema: {
            body: PasswordResetSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    message: typebox_1.Type.String(),
                }),
                400: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        const { token, newPassword } = request.body;
        const context = (0, errors_1.createErrorContext)({
            ip: request.ip,
            method: request.method,
            url: request.url,
            headers: request.headers,
            ...(request.user &&
                typeof request.user === 'object' &&
                'email' in request.user &&
                'role' in request.user
                ? {
                    user: {
                        id: request.user.id,
                        email: request.user.email,
                        role: request.user.role,
                    },
                }
                : {}),
        });
        try {
            // Verify token
            const user = await index_1.userRepository.verifyPasswordResetToken(token);
            if (!user) {
                throw new errors_1.AuthenticationError('Invalid or expired password reset token');
            }
            // Update password
            const success = await index_1.userRepository.updatePassword(user.id, newPassword);
            if (!success) {
                throw new errors_1.ValidationError('Failed to update password', []);
            }
            logger_1.securityLogger.logAuthEvent('password_reset', {
                userId: user.id,
                email: user.email,
                ip: request.ip,
            });
            reply.code(200).send({
                success: true,
                message: 'Password has been reset successfully. You can now log in with your new password.',
            });
        }
        catch (error) {
            logger_1.logger.error({ error, context }, 'Password reset failed');
            if (error instanceof errors_1.AuthenticationError || error instanceof errors_1.ValidationError) {
                reply.code(400).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Password reset failed',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * GET /auth/verify-email/:token - Verify email address
     */
    fastify.get('/auth/verify-email/:token', async (request, reply) => {
        const { token } = request.params;
        try {
            const user = await index_1.userRepository.verifyEmail(token);
            if (!user) {
                throw new errors_1.AuthenticationError('Invalid or expired email verification token');
            }
            logger_1.securityLogger.logAuthEvent('email_verified', {
                userId: user.id,
                email: user.email,
                ip: request.ip,
            });
            reply.code(200).send({
                success: true,
                message: 'Email address verified successfully. You can now log in.',
            });
        }
        catch (error) {
            logger_1.logger.error({ error, token }, 'Email verification failed');
            reply.code(400).send({
                error: {
                    message: 'Invalid or expired verification token',
                    code: 'INVALID_TOKEN',
                },
            });
        }
    });
    /**
     * GET /auth/me - Get current user profile
     */
    fastify.get('/auth/me', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Authentication'],
            summary: 'Get Current User',
            description: 'Get the profile information of the currently authenticated user',
            security: [{ BearerAuth: [] }],
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    data: typebox_1.Type.Object({
                        user: typebox_1.Type.Object({
                            id: typebox_1.Type.String({ format: 'uuid' }),
                            email: typebox_1.Type.String({ format: 'email' }),
                            name: typebox_1.Type.String(),
                            role: typebox_1.Type.String({ enum: ['ceo', 'manager', 'staff'] }),
                            avatar_url: typebox_1.Type.Union([typebox_1.Type.String({ format: 'uri' }), typebox_1.Type.Null()]),
                            department: typebox_1.Type.Union([typebox_1.Type.String(), typebox_1.Type.Null()]),
                            job_title: typebox_1.Type.Union([typebox_1.Type.String(), typebox_1.Type.Null()]),
                            phone: typebox_1.Type.Union([typebox_1.Type.String(), typebox_1.Type.Null()]),
                            language_preference: typebox_1.Type.Union([typebox_1.Type.String(), typebox_1.Type.Null()]),
                            timezone: typebox_1.Type.Union([typebox_1.Type.String(), typebox_1.Type.Null()]),
                            notification_settings: typebox_1.Type.Any(),
                            voice_settings: typebox_1.Type.Any(),
                            email_verified: typebox_1.Type.Boolean(),
                            last_active: typebox_1.Type.Union([typebox_1.Type.String({ format: 'date-time' }), typebox_1.Type.Null()]),
                            created_at: typebox_1.Type.String({ format: 'date-time' }),
                            updated_at: typebox_1.Type.Union([typebox_1.Type.String({ format: 'date-time' }), typebox_1.Type.Null()]),
                            permissions: typebox_1.Type.Array(typebox_1.Type.String()),
                        }),
                    }),
                }),
                401: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        if (!request.user) {
            throw new errors_1.AuthenticationError('Authentication required');
        }
        try {
            const user = await index_1.userRepository.findById(request.user.userId);
            if (!user) {
                throw new errors_1.AuthenticationError('User not found');
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
        }
        catch (error) {
            logger_1.logger.error({ error, userId: request.user.userId }, 'Get profile failed');
            if (error instanceof errors_1.AuthenticationError) {
                reply.code(401).send((0, errors_1.formatErrorResponse)(error));
            }
            else {
                reply.code(500).send({
                    error: {
                        message: 'Failed to get user profile',
                        code: 'SERVER_ERROR',
                    },
                });
            }
        }
    });
    /**
     * POST /auth/resend-verification - Resend email verification
     */
    fastify.post('/auth/resend-verification', {
        preHandler: [middleware_1.authRateLimit],
        schema: {
            tags: ['Authentication'],
            summary: 'Resend Email Verification',
            description: 'Resend email verification link to the specified email address',
            body: typebox_1.Type.Object({
                email: typebox_1.Type.String({ format: 'email' }),
            }),
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    message: typebox_1.Type.String(),
                }),
                400: typebox_1.Type.Object({
                    error: typebox_1.Type.Object({
                        message: typebox_1.Type.String(),
                        code: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        const { email } = request.body;
        const context = (0, errors_1.createErrorContext)({
            ip: request.ip,
            method: request.method,
            url: request.url,
            headers: request.headers,
        });
        try {
            // Check if user exists with this email
            const user = await index_1.userRepository.findByEmail(email);
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
            const verificationToken = jwt_1.jwtService.generateEmailVerificationToken(user.id, user.email);
            await index_1.userRepository.setEmailVerificationToken(user.id, verificationToken);
            // Send verification link resend email
            const emailSent = await EmailService_1.emailService.sendVerificationLinkResend({
                userEmail: user.email,
                userName: user.name,
                verificationToken,
            });
            if (!emailSent) {
                logger_1.logger.warn({ userId: user.id, email: user.email }, 'Failed to send verification email');
            }
            logger_1.securityLogger.logAuthEvent('email_verified', {
                userId: user.id,
                email: user.email,
                ip: request.ip,
                emailSent,
            });
            reply.code(200).send({
                success: true,
                message: 'Verification email sent successfully. Please check your inbox and spam folder.',
            });
        }
        catch (error) {
            logger_1.logger.error({ error, context, email }, 'Resend verification failed');
            reply.code(500).send({
                error: {
                    message: 'Failed to resend verification email',
                    code: 'SERVER_ERROR',
                },
            });
        }
    });
};
exports.registerAuthRoutes = registerAuthRoutes;
//# sourceMappingURL=routes.js.map