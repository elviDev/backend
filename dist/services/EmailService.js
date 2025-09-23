"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const resend_1 = require("resend");
const logger_1 = require("@utils/logger");
class EmailService {
    resend;
    frontendUrl;
    fromEmail;
    fromName;
    constructor() {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            throw new Error('RESEND_API_KEY environment variable is required');
        }
        this.resend = new resend_1.Resend(apiKey);
        this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        this.fromEmail = process.env.FROM_EMAIL || 'noreply@yourdomain.com';
        this.fromName = process.env.FROM_NAME || 'CEO Communication Platform';
    }
    async sendEmail(options) {
        try {
            // Check if we should skip actual sending (only if explicitly disabled or no API key)
            const shouldSkipSending = process.env.DISABLE_EMAIL_SENDING === 'true' || !process.env.RESEND_API_KEY;
            if (shouldSkipSending) {
                // Log the email content instead of sending
                logger_1.logger.info({
                    from: `${this.fromName} <${this.fromEmail}>`,
                    to: options.to,
                    subject: options.subject,
                    html: options.html,
                    text: options.text,
                }, 'Email logged (email sending disabled or no API key)');
                return true;
            }
            const { data, error } = await this.resend.emails.send({
                from: `${this.fromName} <${this.fromEmail}>`,
                to: [options.to],
                subject: options.subject,
                html: options.html,
                text: options.text,
            });
            if (error) {
                logger_1.logger.error({ error, to: options.to, subject: options.subject }, 'Failed to send email via Resend');
                return false;
            }
            logger_1.logger.info({
                messageId: data?.id,
                to: options.to,
                subject: options.subject,
            }, 'Email sent via Resend');
            return true;
        }
        catch (error) {
            logger_1.logger.error({ error, to: options.to, subject: options.subject }, 'Failed to send email');
            return false;
        }
    }
    async sendWelcomeEmail(data) {
        const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to CEO Communication Platform</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
            .btn { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .role-badge { background-color: #e3f2fd; color: #1976d2; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to CEO Communication Platform!</h1>
            </div>
            <div class="content">
              <h2>Hello, ${data.userName}!</h2>
              <p>Your account has been successfully created with the role: <span class="role-badge">${data.role.toUpperCase()}</span></p>

              <p>You now have access to our comprehensive communication platform where you can:</p>
              <ul>
                <li>📊 Collaborate on tasks and projects</li>
                <li>💬 Communicate in channels</li>
                <li>🔔 Receive real-time notifications</li>
                <li>📁 Share and manage files</li>
                <li>🎯 Track project progress</li>
              </ul>

              <div style="text-align: center;">
                <a href="${this.frontendUrl}/login" class="btn">Get Started</a>
              </div>

              <p><strong>Next steps:</strong></p>
              <ol>
                <li>Complete your profile setup</li>
                <li>Join relevant channels</li>
                <li>Explore the dashboard</li>
              </ol>

              <p>If you have any questions, don't hesitate to reach out to your team administrator.</p>
            </div>
            <div class="footer">
              <p>Welcome aboard! 🚀<br>The CEO Communication Platform Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
        const text = `
Welcome to CEO Communication Platform, ${data.userName}!

Your account has been successfully created with the role: ${data.role.toUpperCase()}

You now have access to our comprehensive communication platform where you can:
- Collaborate on tasks and projects
- Communicate in channels
- Receive real-time notifications
- Share and manage files
- Track project progress

Get started: ${this.frontendUrl}/login

Next steps:
1. Complete your profile setup
2. Join relevant channels
3. Explore the dashboard

Welcome aboard!
The CEO Communication Platform Team
    `;
        return this.sendEmail({
            to: data.userEmail,
            subject: 'Welcome to CEO Communication Platform! 🎉',
            html,
            text,
        });
    }
    async sendEmailVerification(data) {
        const verificationUrl = `${this.frontendUrl}/verify-email/${data.verificationToken}`;
        const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Verify Your Email</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
            .btn { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .btn:hover { background-color: #0056b3; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📧 Verify Your Email</h1>
            </div>
            <div class="content">
              <h2>Hello, ${data.userName}!</h2>
              <p>Thank you for registering with the CEO Communication Platform. To complete your registration and secure your account, please verify your email address:</p>

              <div style="text-align: center;">
                <a href="${verificationUrl}" class="btn">Verify Email Address</a>
              </div>

              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; font-family: monospace; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
                ${verificationUrl}
              </p>

              <p><strong>⏰ Important:</strong> This verification link will expire in 24 hours for security reasons.</p>

              <p>If you didn't create an account with us, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>This is an automated email from CEO Communication Platform.</p>
            </div>
          </div>
        </body>
      </html>
    `;
        const text = `
Verify Your Email - CEO Communication Platform

Hello, ${data.userName}!

Thank you for registering with the CEO Communication Platform. Please verify your email address by visiting this link:
${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account with us, please ignore this email.
    `;
        return this.sendEmail({
            to: data.userEmail,
            subject: '📧 Please verify your email address',
            html,
            text,
        });
    }
    async sendVerificationLinkResend(data) {
        const verificationUrl = `${this.frontendUrl}/verify-email/${data.verificationToken}`;
        const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Email Verification Link Resent</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #fff3cd; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; border: 1px solid #ffeaa7; }
            .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
            .btn { display: inline-block; padding: 12px 24px; background-color: #ffc107; color: #212529; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold; }
            .btn:hover { background-color: #e0a800; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📬 Verification Link Resent</h1>
            </div>
            <div class="content">
              <h2>Hello again, ${data.userName}!</h2>
              <p>We've sent you a new email verification link as requested. Please use the link below to verify your email address:</p>

              <div style="text-align: center;">
                <a href="${verificationUrl}" class="btn">Verify Email Address</a>
              </div>

              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; font-family: monospace; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
                ${verificationUrl}
              </p>

              <p><strong>⏰ Important:</strong> This new verification link will expire in 24 hours. Any previous verification links are now invalid.</p>

              <p><strong>💡 Tip:</strong> Make sure to check your spam folder if you don't see verification emails.</p>
            </div>
            <div class="footer">
              <p>This is an automated email from CEO Communication Platform.</p>
            </div>
          </div>
        </body>
      </html>
    `;
        const text = `
Email Verification Link Resent - CEO Communication Platform

Hello again, ${data.userName}!

We've sent you a new email verification link as requested. Please verify your email address by visiting this link:
${verificationUrl}

This new verification link will expire in 24 hours. Any previous verification links are now invalid.

Tip: Make sure to check your spam folder if you don't see verification emails.
    `;
        return this.sendEmail({
            to: data.userEmail,
            subject: '📬 New verification link sent',
            html,
            text,
        });
    }
    async sendPasswordReset(data) {
        const resetUrl = `${this.frontendUrl}/reset-password/${data.resetToken}`;
        const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Password Reset Request</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #ffe6e6; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; border: 1px solid #ffb3b3; }
            .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
            .btn { display: inline-block; padding: 12px 24px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold; }
            .btn:hover { background-color: #c82333; }
            .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Password Reset Request</h1>
            </div>
            <div class="content">
              <h2>Hello, ${data.userName}</h2>
              <p>We received a request to reset your password for your CEO Communication Platform account. If you made this request, click the button below:</p>

              <div style="text-align: center;">
                <a href="${resetUrl}" class="btn">Reset My Password</a>
              </div>

              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; font-family: monospace; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
                ${resetUrl}
              </p>

              <div class="warning">
                <strong>🔒 Security Notice:</strong>
                <ul style="margin: 10px 0;">
                  <li>This password reset link will expire in 1 hour</li>
                  <li>If you didn't request this reset, please ignore this email</li>
                  <li>Your password will remain unchanged until you use this link</li>
                  <li>For security, this link can only be used once</li>
                </ul>
              </div>

              <p>If you continue to receive unwanted password reset emails, please contact support immediately.</p>
            </div>
            <div class="footer">
              <p>This is an automated security email from CEO Communication Platform.</p>
            </div>
          </div>
        </body>
      </html>
    `;
        const text = `
Password Reset Request - CEO Communication Platform

Hello, ${data.userName}

We received a request to reset your password. If you made this request, please visit this link to reset your password:

${resetUrl}

SECURITY NOTICE:
- This link will expire in 1 hour for security reasons
- If you didn't request this reset, please ignore this email
- Your password will remain unchanged until you use this link
- This link can only be used once

If you continue to receive unwanted password reset emails, please contact support immediately.
    `;
        return this.sendEmail({
            to: data.userEmail,
            subject: '🔐 Password reset request',
            html,
            text,
        });
    }
    async sendChannelMemberAdded(data) {
        const channelUrl = `${this.frontendUrl}/channels`;
        const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Added to Channel</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #e8f5e8; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; border: 1px solid #c3e6c3; }
            .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
            .btn { display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold; }
            .btn:hover { background-color: #218838; }
            .channel-info { background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #28a745; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📢 You've been added to a channel!</h1>
            </div>
            <div class="content">
              <h2>Hello, ${data.userName}!</h2>
              <p><strong>${data.addedByName}</strong> has added you to a new channel on the CEO Communication Platform.</p>

              <div class="channel-info">
                <h3 style="margin-top: 0;">📁 ${data.channelName}</h3>
                ${data.channelDescription ? `<p><strong>Description:</strong> ${data.channelDescription}</p>` : ''}
                <p><strong>Added by:</strong> ${data.addedByName}</p>
              </div>

              <p>You can now:</p>
              <ul>
                <li>📝 Participate in channel discussions</li>
                <li>📁 Access shared files and resources</li>
                <li>🔔 Receive channel notifications</li>
                <li>👥 Collaborate with other channel members</li>
              </ul>

              <div style="text-align: center;">
                <a href="${channelUrl}" class="btn">View Channel</a>
              </div>

              <p><strong>💡 Tip:</strong> You can customize your notification preferences for this channel in the settings.</p>
            </div>
            <div class="footer">
              <p>Happy collaborating! 🤝<br>The CEO Communication Platform Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
        const text = `
You've been added to a channel! - CEO Communication Platform

Hello, ${data.userName}!

${data.addedByName} has added you to a new channel on the CEO Communication Platform.

Channel: ${data.channelName}
${data.channelDescription ? `Description: ${data.channelDescription}` : ''}
Added by: ${data.addedByName}

You can now:
- Participate in channel discussions
- Access shared files and resources
- Receive channel notifications
- Collaborate with other channel members

View Channel: ${channelUrl}

Tip: You can customize your notification preferences for this channel in the settings.

Happy collaborating!
The CEO Communication Platform Team
    `;
        return this.sendEmail({
            to: data.userEmail,
            subject: `📢 Added to channel: ${data.channelName}`,
            html,
            text,
        });
    }
    async sendTaskAssigned(data) {
        const tasksUrl = `${this.frontendUrl}/tasks`;
        const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>New Task Assignment</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #e3f2fd; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; border: 1px solid #90caf9; }
            .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
            .btn { display: inline-block; padding: 12px 24px; background-color: #2196f3; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold; }
            .btn:hover { background-color: #1976d2; }
            .task-info { background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #2196f3; }
            .priority-high { border-left-color: #f44336; }
            .priority-medium { border-left-color: #ff9800; }
            .priority-low { border-left-color: #4caf50; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📋 New Task Assignment</h1>
            </div>
            <div class="content">
              <h2>Hello, ${data.userName}!</h2>
              <p><strong>${data.assignedByName}</strong> has assigned you a new task on the CEO Communication Platform.</p>

              <div class="task-info ${data.priority ? `priority-${data.priority.toLowerCase()}` : ''}">
                <h3 style="margin-top: 0;">🎯 ${data.taskTitle}</h3>
                ${data.taskDescription ? `<p><strong>Description:</strong> ${data.taskDescription}</p>` : ''}
                <p><strong>Assigned by:</strong> ${data.assignedByName}</p>
                ${data.priority ? `<p><strong>Priority:</strong> <span style="text-transform: uppercase; font-weight: bold;">${data.priority}</span></p>` : ''}
                ${data.dueDate ? `<p><strong>Due Date:</strong> ${data.dueDate}</p>` : ''}
              </div>

              <p>What you can do:</p>
              <ul>
                <li>📝 View full task details and requirements</li>
                <li>💬 Add comments and updates</li>
                <li>📎 Attach files and resources</li>
                <li>✅ Update task status as you progress</li>
              </ul>

              <div style="text-align: center;">
                <a href="${tasksUrl}" class="btn">View Task</a>
              </div>

              <p><strong>⏰ Remember:</strong> Regular updates help keep the team informed of your progress!</p>
            </div>
            <div class="footer">
              <p>Get it done! 💪<br>The CEO Communication Platform Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
        const text = `
New Task Assignment - CEO Communication Platform

Hello, ${data.userName}!

${data.assignedByName} has assigned you a new task on the CEO Communication Platform.

Task: ${data.taskTitle}
${data.taskDescription ? `Description: ${data.taskDescription}` : ''}
Assigned by: ${data.assignedByName}
${data.priority ? `Priority: ${data.priority.toUpperCase()}` : ''}
${data.dueDate ? `Due Date: ${data.dueDate}` : ''}

What you can do:
- View full task details and requirements
- Add comments and updates
- Attach files and resources
- Update task status as you progress

View Task: ${tasksUrl}

Remember: Regular updates help keep the team informed of your progress!

Get it done!
The CEO Communication Platform Team
    `;
        return this.sendEmail({
            to: data.userEmail,
            subject: `📋 New task assigned: ${data.taskTitle}`,
            html,
            text,
        });
    }
    async sendTaskStatusChanged(data) {
        const tasksUrl = `${this.frontendUrl}/tasks`;
        const getStatusEmoji = (status) => {
            switch (status.toLowerCase()) {
                case 'pending': return '⏳';
                case 'in_progress': return '🔄';
                case 'completed': return '✅';
                case 'cancelled': return '❌';
                case 'on_hold': return '⏸️';
                default: return '📝';
            }
        };
        const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Task Status Update</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #fff3e0; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; border: 1px solid #ffcc80; }
            .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
            .btn { display: inline-block; padding: 12px 24px; background-color: #ff9800; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold; }
            .btn:hover { background-color: #f57c00; }
            .status-change { background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ff9800; }
            .status-completed { border-left-color: #4caf50; }
            .status-cancelled { border-left-color: #f44336; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📊 Task Status Update</h1>
            </div>
            <div class="content">
              <h2>Hello, ${data.userName}!</h2>
              <p>There's been an update to a task you're involved with on the CEO Communication Platform.</p>

              <div class="status-change ${data.newStatus.toLowerCase() === 'completed' ? 'status-completed' : data.newStatus.toLowerCase() === 'cancelled' ? 'status-cancelled' : ''}">
                <h3 style="margin-top: 0;">🎯 ${data.taskTitle}</h3>
                <p><strong>Status changed by:</strong> ${data.changedByName}</p>
                <div style="display: flex; align-items: center; gap: 10px; margin: 10px 0;">
                  <span style="background-color: #e0e0e0; padding: 4px 12px; border-radius: 20px; font-size: 14px;">
                    ${getStatusEmoji(data.oldStatus)} ${data.oldStatus.replace('_', ' ').toUpperCase()}
                  </span>
                  <span style="font-size: 18px;">→</span>
                  <span style="background-color: #c8e6c9; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold;">
                    ${getStatusEmoji(data.newStatus)} ${data.newStatus.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>

              ${data.newStatus.toLowerCase() === 'completed' ?
            '<p>🎉 <strong>Congratulations!</strong> This task has been marked as completed!</p>' :
            data.newStatus.toLowerCase() === 'cancelled' ?
                '<p>ℹ️ This task has been cancelled and no further action is required.</p>' :
                '<p>Please check the task details for any additional information or requirements.</p>'}

              <div style="text-align: center;">
                <a href="${tasksUrl}" class="btn">View Task Details</a>
              </div>
            </div>
            <div class="footer">
              <p>Stay updated! 📈<br>The CEO Communication Platform Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
        const text = `
Task Status Update - CEO Communication Platform

Hello, ${data.userName}!

There's been an update to a task you're involved with on the CEO Communication Platform.

Task: ${data.taskTitle}
Status changed by: ${data.changedByName}

Status Change:
${data.oldStatus.replace('_', ' ').toUpperCase()} → ${data.newStatus.replace('_', ' ').toUpperCase()}

${data.newStatus.toLowerCase() === 'completed' ?
            'Congratulations! This task has been marked as completed!' :
            data.newStatus.toLowerCase() === 'cancelled' ?
                'This task has been cancelled and no further action is required.' :
                'Please check the task details for any additional information or requirements.'}

View Task Details: ${tasksUrl}

Stay updated!
The CEO Communication Platform Team
    `;
        return this.sendEmail({
            to: data.userEmail,
            subject: `📊 Task status updated: ${data.taskTitle}`,
            html,
            text,
        });
    }
}
exports.emailService = new EmailService();
//# sourceMappingURL=EmailService.js.map