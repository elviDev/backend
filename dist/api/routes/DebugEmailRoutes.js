"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDebugEmailRoutes = void 0;
const typebox_1 = require("@sinclair/typebox");
const EmailService_1 = require("@/services/EmailService");
const middleware_1 = require("@auth/middleware");
const logger_1 = require("@utils/logger");
const TestEmailSchema = typebox_1.Type.Object({
    to: typebox_1.Type.String({ format: 'email' }),
    type: typebox_1.Type.Optional(typebox_1.Type.Union([
        typebox_1.Type.Literal('welcome'),
        typebox_1.Type.Literal('verification'),
        typebox_1.Type.Literal('password-reset'),
        typebox_1.Type.Literal('simple')
    ])),
});
const registerDebugEmailRoutes = async (fastify) => {
    /**
     * POST /debug/send-test-email - Send a test email
     */
    fastify.post('/debug/send-test-email', {
        preHandler: [middleware_1.authenticate],
        schema: {
            tags: ['Debug'],
            summary: 'Send Test Email',
            description: 'Send a test email to verify email functionality',
            body: TestEmailSchema,
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    message: typebox_1.Type.String(),
                    emailSent: typebox_1.Type.Boolean(),
                    config: typebox_1.Type.Object({
                        apiKeyPresent: typebox_1.Type.Boolean(),
                        fromEmail: typebox_1.Type.String(),
                        fromName: typebox_1.Type.String(),
                        environment: typebox_1.Type.String(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        try {
            const { to, type = 'simple' } = request.body;
            let emailSent = false;
            switch (type) {
                case 'welcome':
                    emailSent = await EmailService_1.emailService.sendWelcomeEmail({
                        userEmail: to,
                        userName: 'Test User',
                        role: 'staff',
                    });
                    break;
                case 'verification':
                    emailSent = await EmailService_1.emailService.sendEmailVerification({
                        userEmail: to,
                        userName: 'Test User',
                        verificationToken: 'test-token-123',
                    });
                    break;
                case 'password-reset':
                    emailSent = await EmailService_1.emailService.sendPasswordReset({
                        userEmail: to,
                        userName: 'Test User',
                        resetToken: 'test-reset-token-123',
                    });
                    break;
                case 'simple':
                default:
                    emailSent = await EmailService_1.emailService.sendEmail({
                        to,
                        subject: '🧪 Test Email from CEO Communication Platform',
                        html: `
                <h1>Test Email</h1>
                <p>This is a test email sent at ${new Date().toISOString()}</p>
                <p>If you received this, your email configuration is working correctly!</p>
                <hr>
                <p><small>Sent from CEO Communication Platform Debug Endpoint</small></p>
              `,
                        text: `Test Email\n\nThis is a test email sent at ${new Date().toISOString()}\n\nIf you received this, your email configuration is working correctly!\n\nSent from CEO Communication Platform Debug Endpoint`,
                    });
                    break;
            }
            const config = {
                apiKeyPresent: !!process.env.RESEND_API_KEY,
                fromEmail: process.env.FROM_EMAIL || 'not-set',
                fromName: process.env.FROM_NAME || 'not-set',
                environment: process.env.NODE_ENV || 'not-set',
            };
            logger_1.logger.info({
                to,
                type,
                emailSent,
                config,
                userId: request.user?.userId,
            }, 'Debug email test completed');
            reply.send({
                success: true,
                message: `Test email ${emailSent ? 'sent successfully' : 'failed to send'}`,
                emailSent,
                config,
            });
        }
        catch (error) {
            logger_1.logger.error({ error, body: request.body }, 'Failed to send test email');
            reply.code(500).send({
                success: false,
                message: 'Failed to send test email',
                emailSent: false,
                config: {
                    apiKeyPresent: !!process.env.RESEND_API_KEY,
                    fromEmail: process.env.FROM_EMAIL || 'not-set',
                    fromName: process.env.FROM_NAME || 'not-set',
                    environment: process.env.NODE_ENV || 'not-set',
                },
            });
        }
    });
    /**
     * GET /debug/email-config - Get email configuration status
     */
    fastify.get('/debug/email-config', {
        preHandler: [middleware_1.authenticate],
        schema: {
            tags: ['Debug'],
            summary: 'Get Email Configuration',
            description: 'Get current email configuration status',
            response: {
                200: typebox_1.Type.Object({
                    success: typebox_1.Type.Boolean(),
                    config: typebox_1.Type.Object({
                        apiKeyPresent: typebox_1.Type.Boolean(),
                        apiKeyMasked: typebox_1.Type.String(),
                        fromEmail: typebox_1.Type.String(),
                        fromName: typebox_1.Type.String(),
                        environment: typebox_1.Type.String(),
                        emailSendingEnabled: typebox_1.Type.Boolean(),
                    }),
                }),
            },
        },
    }, async (request, reply) => {
        const apiKey = process.env.RESEND_API_KEY;
        const config = {
            apiKeyPresent: !!apiKey,
            apiKeyMasked: apiKey ? `${apiKey.substring(0, 8)}...` : 'not-set',
            fromEmail: process.env.FROM_EMAIL || 'not-set',
            fromName: process.env.FROM_NAME || 'not-set',
            environment: process.env.NODE_ENV || 'not-set',
            emailSendingEnabled: !(process.env.DISABLE_EMAIL_SENDING === 'true' || !apiKey),
        };
        reply.send({
            success: true,
            config,
        });
    });
};
exports.registerDebugEmailRoutes = registerDebugEmailRoutes;
//# sourceMappingURL=DebugEmailRoutes.js.map