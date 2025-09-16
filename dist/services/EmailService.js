"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const logger_1 = require("@utils/logger");
class EmailService {
    transporter;
    frontendUrl;
    constructor() {
        this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        this.setupTransporter();
    }
    setupTransporter() {
        if (process.env.NODE_ENV === 'development') {
            // For development, log emails to console to avoid rate limiting
            this.transporter = nodemailer_1.default.createTransport({
                streamTransport: true,
                newline: 'unix',
                buffer: true,
            });
        }
        else {
            // Production configuration
            const emailConfig = {
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            };
            this.transporter = nodemailer_1.default.createTransport(emailConfig);
        }
    }
    async sendEmail(options) {
        try {
            const info = await this.transporter.sendMail({
                from: process.env.FROM_EMAIL || 'noreply@ceocommunication.com',
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text,
            });
            if (process.env.NODE_ENV === 'development') {
                // In development, log the email content instead of sending
                logger_1.logger.info({
                    messageId: info.messageId,
                    to: options.to,
                    subject: options.subject,
                    emailContent: info.message.toString(),
                }, 'Email logged (development mode - avoiding rate limits)');
            }
            else {
                logger_1.logger.info({
                    messageId: info.messageId,
                    to: options.to,
                    subject: options.subject,
                }, 'Email sent');
            }
            return true;
        }
        catch (error) {
            logger_1.logger.error({ error, to: options.to, subject: options.subject }, 'Failed to send email');
            return false;
        }
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
              <h1>CEO Communication Platform</h1>
            </div>
            <div class="content">
              <h2>Welcome, ${data.userName}!</h2>
              <p>Thank you for registering with the CEO Communication Platform. To complete your registration, please verify your email address by clicking the button below:</p>
              
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="btn">Verify Email Address</a>
              </div>
              
              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p style="word-break: break-all; font-family: monospace; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
                ${verificationUrl}
              </p>
              
              <p><strong>Important:</strong> This verification link will expire in 24 hours for security reasons.</p>
              
              <p>If you didn't create an account with us, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>This is an automated email from CEO Communication Platform. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
        const text = `
Welcome to CEO Communication Platform, ${data.userName}!

Please verify your email address by visiting this link:
${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account with us, please ignore this email.
    `;
        return this.sendEmail({
            to: data.userEmail,
            subject: 'Verify Your Email Address - CEO Communication Platform',
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
          <title>Password Reset</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
            .btn { display: inline-block; padding: 12px 24px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .btn:hover { background-color: #c82333; }
            .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>CEO Communication Platform</h1>
            </div>
            <div class="content">
              <h2>Password Reset Request</h2>
              <p>Hello ${data.userName},</p>
              <p>We received a request to reset your password for your CEO Communication Platform account. If you made this request, click the button below to reset your password:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="btn">Reset Password</a>
              </div>
              
              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p style="word-break: break-all; font-family: monospace; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
                ${resetUrl}
              </p>
              
              <div class="warning">
                <strong>Security Notice:</strong>
                <ul style="margin: 10px 0;">
                  <li>This password reset link will expire in 1 hour</li>
                  <li>If you didn't request this reset, please ignore this email</li>
                  <li>Your password will remain unchanged until you use this link</li>
                </ul>
              </div>
              
              <p>For security reasons, if you continue to receive unwanted password reset emails, please contact our support team.</p>
            </div>
            <div class="footer">
              <p>This is an automated email from CEO Communication Platform. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
        const text = `
Password Reset Request - CEO Communication Platform

Hello ${data.userName},

We received a request to reset your password. If you made this request, please visit this link to reset your password:

${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request this reset, please ignore this email. Your password will remain unchanged.
    `;
        return this.sendEmail({
            to: data.userEmail,
            subject: 'Password Reset Request - CEO Communication Platform',
            html,
            text,
        });
    }
}
exports.emailService = new EmailService();
//# sourceMappingURL=EmailService.js.map