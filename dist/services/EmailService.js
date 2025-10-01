"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const nodejs_1 = __importDefault(require("@emailjs/nodejs"));
const logger_1 = require("@utils/logger");
class EmailService {
    frontendUrl;
    serviceId;
    publicKey;
    privateKey;
    verificationTemplateId;
    passwordResetTemplateId;
    constructor() {
        this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        this.serviceId = process.env.EMAILJS_SERVICE_ID || '';
        this.publicKey = process.env.EMAILJS_PUBLIC_KEY || '';
        this.privateKey = process.env.EMAILJS_PRIVATE_KEY || '';
        this.verificationTemplateId = process.env.EMAILJS_VERIFICATION_TEMPLATE_ID || '';
        this.passwordResetTemplateId = process.env.EMAILJS_PASSWORD_RESET_TEMPLATE_ID || '';
        if (!this.serviceId || !this.publicKey || !this.privateKey) {
            logger_1.logger.warn('EmailJS configuration incomplete. Some environment variables are missing.');
        }
    }
    async sendEmail(options) {
        try {
            if (process.env.NODE_ENV === 'development') {
                // In development, log the email content instead of sending
                logger_1.logger.info({
                    to: options.to,
                    subject: options.subject,
                    html: options.html,
                    text: options.text,
                }, 'Email logged (development mode - avoiding rate limits)');
                return true;
            }
            // For production, use EmailJS
            const templateParams = {
                to_email: options.to,
                subject: options.subject,
                html_content: options.html,
                text_content: options.text || '',
                from_email: process.env.FROM_EMAIL || 'noreply@ceocommunication.com',
            };
            const response = await nodejs_1.default.send(this.serviceId, process.env.EMAILJS_GENERIC_TEMPLATE_ID || 'generic_template', templateParams, {
                publicKey: this.publicKey,
                privateKey: this.privateKey,
            });
            logger_1.logger.info({
                messageId: response.text,
                to: options.to,
                subject: options.subject,
            }, 'Email sent via EmailJS');
            return true;
        }
        catch (error) {
            logger_1.logger.error({ error, to: options.to, subject: options.subject }, 'Failed to send email via EmailJS');
            return false;
        }
    }
    async sendEmailVerification(data) {
        try {
            if (process.env.NODE_ENV === 'development') {
                if (data.verificationOTP) {
                    // New OTP-based verification
                    logger_1.logger.info({
                        userEmail: data.userEmail,
                        userName: data.userName,
                        verificationOTP: data.verificationOTP,
                        message: 'OTP-based email verification',
                    }, 'Email verification OTP logged (development mode)');
                }
                else {
                    // Legacy token-based verification
                    const verificationUrl = `${this.frontendUrl}/verify-email/${data.verificationToken}`;
                    logger_1.logger.info({
                        userEmail: data.userEmail,
                        userName: data.userName,
                        verificationUrl,
                        message: 'Token-based email verification',
                    }, 'Email verification logged (development mode)');
                }
                return true;
            }
            let templateParams;
            if (data.verificationOTP) {
                // Use OTP-based template
                templateParams = {
                    to_email: data.userEmail,
                    user_name: data.userName,
                    verification_otp: data.verificationOTP,
                    otp_formatted: this.formatOTP(data.verificationOTP),
                    frontend_url: this.frontendUrl,
                    from_email: process.env.FROM_EMAIL || 'noreply@ceocommunication.com',
                    expires_in_minutes: '10',
                };
            }
            else {
                // Legacy token-based template
                const verificationUrl = `${this.frontendUrl}/verify-email/${data.verificationToken}`;
                templateParams = {
                    to_email: data.userEmail,
                    user_name: data.userName,
                    verification_url: verificationUrl,
                    frontend_url: this.frontendUrl,
                    from_email: process.env.FROM_EMAIL || 'noreply@ceocommunication.com',
                };
            }
            const response = await nodejs_1.default.send(this.serviceId, this.verificationTemplateId, templateParams, {
                publicKey: this.publicKey,
                privateKey: this.privateKey,
            });
            logger_1.logger.info({
                messageId: response.text,
                to: data.userEmail,
                subject: 'Email Verification',
                type: data.verificationOTP ? 'OTP' : 'Token',
            }, 'Email verification sent via EmailJS');
            return true;
        }
        catch (error) {
            logger_1.logger.error({ error, to: data.userEmail }, 'Failed to send email verification via EmailJS');
            return false;
        }
    }
    formatOTP(otp) {
        // Format OTP as "123 456" for better readability
        if (otp.length === 6) {
            return `${otp.substring(0, 3)} ${otp.substring(3)}`;
        }
        return otp;
    }
    async sendPasswordReset(data) {
        try {
            if (process.env.NODE_ENV === 'development') {
                const resetUrl = `${this.frontendUrl}/reset-password/${data.resetToken}`;
                logger_1.logger.info({
                    userEmail: data.userEmail,
                    userName: data.userName,
                    resetUrl,
                }, 'Password reset email logged (development mode)');
                return true;
            }
            const resetUrl = `${this.frontendUrl}/reset-password/${data.resetToken}`;
            const templateParams = {
                to_email: data.userEmail,
                user_name: data.userName,
                reset_url: resetUrl,
                frontend_url: this.frontendUrl,
                from_email: process.env.FROM_EMAIL || 'noreply@ceocommunication.com',
            };
            const response = await nodejs_1.default.send(this.serviceId, this.passwordResetTemplateId, templateParams, {
                publicKey: this.publicKey,
                privateKey: this.privateKey,
            });
            logger_1.logger.info({
                messageId: response.text,
                to: data.userEmail,
                subject: 'Password Reset',
            }, 'Password reset email sent via EmailJS');
            return true;
        }
        catch (error) {
            logger_1.logger.error({ error, to: data.userEmail }, 'Failed to send password reset email via EmailJS');
            return false;
        }
    }
}
exports.emailService = new EmailService();
//# sourceMappingURL=EmailService.js.map