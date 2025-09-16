import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { channelRepository } from '@db/index';
import { loggers } from '@utils/logger';
import {
  formatErrorResponse,
  createErrorContext,
  ExternalServiceError,
} from '@utils/errors';
import { authenticate } from '@auth/middleware';
import { WebSocketUtils } from '@websocket/utils';

// Schema definitions
const ChannelNotificationSchema = Type.Object({
  channelId: Type.String(),
  senderId: Type.String(),
  senderName: Type.String(),
  message: Type.String(),
  type: Type.Union([Type.Literal('new_message'), Type.Literal('thread_reply')]),
  parentMessageId: Type.Optional(Type.String()),
});

type ChannelNotificationRequest = Static<typeof ChannelNotificationSchema>;

export async function notificationRoutes(fastify: FastifyInstance) {
  /**
   * POST /notifications/channel - Send push notifications to channel members
   */
  fastify.post<{ Body: ChannelNotificationRequest }>(
    '/notifications/channel',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Notifications'],
        summary: 'Send Channel Notification',
        description: 'Send push notifications to all channel members except the sender',
        body: ChannelNotificationSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
            notificationsSent: Type.Number(),
          }),
          400: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
          500: Type.Object({
            error: Type.Object({
              message: Type.String(),
              code: Type.String(),
            }),
          }),
        },
      },
    },
    async (request: FastifyRequest<{ Body: ChannelNotificationRequest }>, reply: FastifyReply) => {
      const { channelId, senderId, senderName, message, type, parentMessageId } = request.body;
      
      const context = createErrorContext({
        ...(request.user && {
          user: {
            id: request.user.userId,
            email: request.user.email ?? '',
            role: request.user.role,
          },
        }),
        ip: request.ip,
        method: request.method,
        url: request.url,
        headers: request.headers as Record<string, string | string[] | undefined>,
      });

      try {
        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            type,
            messageLength: message.length,
          },
          'Sending channel notification'
        );

        // Get channel members (excluding the sender)
        const members = await channelRepository.getMembers(channelId);
        const recipientMembers = members.filter(member => member.user_id !== senderId);

        if (recipientMembers.length === 0) {
          return reply.send({
            success: true,
            message: 'No recipients to notify',
            notificationsSent: 0,
          });
        }

        // Prepare notification data
        const notificationTitle = type === 'thread_reply' 
          ? `${senderName} replied in thread`
          : `New message in channel`;

        const notificationBody = message.length > 100 
          ? `${message.substring(0, 97)}...`
          : message;

        // Send notifications via WebSocket (which can trigger push notifications)
        let notificationsSent = 0;
        for (const member of recipientMembers) {
          try {
            // Send WebSocket notification
            await WebSocketUtils.createAndSendNotification(member.user_id, {
              title: notificationTitle,
              message: notificationBody,
              category: 'channel' as const,
              priority: 'medium' as const,
              data: {
                channelId,
                senderId,
                senderName,
                messageId: parentMessageId || 'new',
                type,
              },
            });

            notificationsSent++;
          } catch (error) {
            loggers.api.warn(
              { error, userId: member.user_id, channelId },
              'Failed to send notification to user'
            );
          }
        }

        loggers.api.info(
          {
            userId: request.user?.userId,
            channelId,
            type,
            notificationsSent,
            totalRecipients: recipientMembers.length,
          },
          'Channel notifications sent successfully'
        );

        reply.send({
          success: true,
          message: 'Notifications sent successfully',
          notificationsSent,
        });

      } catch (error) {
        loggers.api.error({ error, context }, 'Failed to send channel notifications');

        const notificationError = new ExternalServiceError('Failed to send notifications', 'notification-service', error as Error);
        reply.code(502).send(formatErrorResponse(notificationError));
      }
    }
  );

  /**
   * POST /notifications/register - Register device token for push notifications
   */
  fastify.post<{
    Body: {
      token: string;
      platform: 'ios' | 'android';
      deviceInfo?: {
        brand?: string;
        modelName?: string;
        osName?: string;
        osVersion?: string;
      };
    };
  }>(
    '/notifications/register',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Notifications'],
        summary: 'Register Device Token',
        description: 'Register device token for push notifications',
        body: Type.Object({
          token: Type.String(),
          platform: Type.Union([Type.Literal('ios'), Type.Literal('android')]),
          deviceInfo: Type.Optional(Type.Object({
            brand: Type.Optional(Type.String()),
            modelName: Type.Optional(Type.String()),
            osName: Type.Optional(Type.String()),
            osVersion: Type.Optional(Type.String()),
          })),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { token, platform, deviceInfo } = request.body;

      try {
        loggers.api.info(
          {
            userId: request.user?.userId,
            platform,
            deviceInfo,
          },
          'Registering device token'
        );

        // Here you would typically save the token to your database
        // associated with the user for later use in push notifications
        
        // For now, just log it as this would require a device_tokens table
        loggers.api.info(
          {
            userId: request.user?.userId,
            tokenLength: token.length,
            platform,
          },
          'Device token registered (not persisted - requires device_tokens table)'
        );

        reply.send({
          success: true,
          message: 'Device token registered successfully',
        });
      } catch (error) {
        loggers.api.error({ error, userId: request.user?.userId }, 'Failed to register device token');

        const tokenError = new ExternalServiceError('Failed to register device token', 'notification-service', error as Error);
        reply.code(502).send(formatErrorResponse(tokenError));
      }
    }
  );

  /**
   * PUT /notifications/preferences - Update notification preferences
   */
  fastify.put<{
    Body: {
      taskNotifications: boolean;
      mentionNotifications: boolean;
      channelNotifications: boolean;
      quietHoursEnabled: boolean;
      quietHoursStart?: string;
      quietHoursEnd?: string;
    };
  }>(
    '/notifications/preferences',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Notifications'],
        summary: 'Update Notification Preferences',
        description: 'Update user notification preferences',
        body: Type.Object({
          taskNotifications: Type.Boolean(),
          mentionNotifications: Type.Boolean(),
          channelNotifications: Type.Boolean(),
          quietHoursEnabled: Type.Boolean(),
          quietHoursStart: Type.Optional(Type.String()),
          quietHoursEnd: Type.Optional(Type.String()),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        loggers.api.info(
          {
            userId: request.user?.userId,
            preferences: request.body,
          },
          'Updating notification preferences'
        );

        // Here you would update the user's notification preferences in the database
        // This would require a user_notification_preferences table or additional columns

        reply.send({
          success: true,
          message: 'Notification preferences updated successfully',
        });
      } catch (error) {
        loggers.api.error({ error, userId: request.user?.userId }, 'Failed to update notification preferences');

        const prefsError = new ExternalServiceError('Failed to update notification preferences', 'preferences-service', error as Error);
        reply.code(502).send(formatErrorResponse(prefsError));
      }
    }
  );

  /**
   * GET /notifications/preferences - Get notification preferences
   */
  fastify.get(
    '/notifications/preferences',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Notifications'],
        summary: 'Get Notification Preferences',
        description: 'Get user notification preferences',
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            data: Type.Object({
              taskNotifications: Type.Boolean(),
              mentionNotifications: Type.Boolean(),
              channelNotifications: Type.Boolean(),
              quietHoursEnabled: Type.Boolean(),
              quietHoursStart: Type.Optional(Type.String()),
              quietHoursEnd: Type.Optional(Type.String()),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        // Return default preferences for now
        // In a real implementation, you'd fetch these from the database
        const defaultPreferences = {
          taskNotifications: true,
          mentionNotifications: true,
          channelNotifications: true,
          quietHoursEnabled: false,
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00',
        };

        reply.send({
          success: true,
          data: defaultPreferences,
        });
      } catch (error) {
        loggers.api.error({ error, userId: request.user?.userId }, 'Failed to get notification preferences');

        const getPrefsError = new ExternalServiceError('Failed to get notification preferences', 'preferences-service', error as Error);
        reply.code(502).send(formatErrorResponse(getPrefsError));
      }
    }
  );
}
