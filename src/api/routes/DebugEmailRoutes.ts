import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { emailService } from '@/services/EmailService';
import { authenticate } from '@auth/middleware';
import { logger } from '@utils/logger';

const TestEmailSchema = Type.Object({
  to: Type.String({ format: 'email' }),
  type: Type.Optional(Type.Union([
    Type.Literal('welcome'),
    Type.Literal('verification'),
    Type.Literal('password-reset'),
    Type.Literal('simple')
  ])),
});

export const registerDebugEmailRoutes = async (fastify: FastifyInstance) => {
  /**
   * POST /debug/send-test-email - Send a test email
   */
  fastify.post<{ Body: typeof TestEmailSchema.static }>(
    '/debug/send-test-email',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Debug'],
        summary: 'Send Test Email',
        description: 'Send a test email to verify email functionality',
        body: TestEmailSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
            emailSent: Type.Boolean(),
            config: Type.Object({
              apiKeyPresent: Type.Boolean(),
              fromEmail: Type.String(),
              fromName: Type.String(),
              environment: Type.String(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { to, type = 'simple' } = request.body;

        let emailSent = false;

        switch (type) {
          case 'welcome':
            emailSent = await emailService.sendWelcomeEmail({
              userEmail: to,
              userName: 'Test User',
              role: 'staff',
            });
            break;

          case 'verification':
            emailSent = await emailService.sendEmailVerification({
              userEmail: to,
              userName: 'Test User',
              verificationToken: 'test-token-123',
            });
            break;

          case 'password-reset':
            emailSent = await emailService.sendPasswordReset({
              userEmail: to,
              userName: 'Test User',
              resetToken: 'test-reset-token-123',
            });
            break;

          case 'simple':
          default:
            emailSent = await emailService.sendEmail({
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

        logger.info(
          {
            to,
            type,
            emailSent,
            config,
            userId: request.user?.userId,
          },
          'Debug email test completed'
        );

        reply.send({
          success: true,
          message: `Test email ${emailSent ? 'sent successfully' : 'failed to send'}`,
          emailSent,
          config,
        });
      } catch (error) {
        logger.error({ error, body: request.body }, 'Failed to send test email');
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
    }
  );

  /**
   * GET /debug/email-config - Get email configuration status
   */
  fastify.get(
    '/debug/email-config',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Debug'],
        summary: 'Get Email Configuration',
        description: 'Get current email configuration status',
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            config: Type.Object({
              apiKeyPresent: Type.Boolean(),
              apiKeyMasked: Type.String(),
              fromEmail: Type.String(),
              fromName: Type.String(),
              environment: Type.String(),
              emailSendingEnabled: Type.Boolean(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
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
    }
  );
};