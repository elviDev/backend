import emailjs from '@emailjs/nodejs';
import { logger } from '@utils/logger';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailVerificationData {
  userEmail: string;
  userName: string;
  verificationToken?: string; // Keep for backward compatibility
  verificationOTP?: string;   // New OTP field
}

export interface PasswordResetData {
  userEmail: string;
  userName: string;
  resetToken: string;
}

class EmailService {
  private readonly frontendUrl: string;
  private readonly serviceId: string;
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly verificationTemplateId: string;
  private readonly passwordResetTemplateId: string;

  constructor() {
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    this.serviceId = process.env.EMAILJS_SERVICE_ID || '';
    this.publicKey = process.env.EMAILJS_PUBLIC_KEY || '';
    this.privateKey = process.env.EMAILJS_PRIVATE_KEY || '';
    this.verificationTemplateId = process.env.EMAILJS_VERIFICATION_TEMPLATE_ID || '';
    this.passwordResetTemplateId = process.env.EMAILJS_PASSWORD_RESET_TEMPLATE_ID || '';

    if (!this.serviceId || !this.publicKey || !this.privateKey) {
      logger.warn('EmailJS configuration incomplete. Some environment variables are missing.');
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      if (process.env.NODE_ENV === 'development') {
        // In development, log the email content instead of sending
        logger.info(
          {
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
          },
          'Email logged (development mode - avoiding rate limits)'
        );
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

      const response = await emailjs.send(
        this.serviceId,
        process.env.EMAILJS_GENERIC_TEMPLATE_ID || 'generic_template',
        templateParams,
        {
          publicKey: this.publicKey,
          privateKey: this.privateKey,
        }
      );

      logger.info(
        {
          messageId: response.text,
          to: options.to,
          subject: options.subject,
        },
        'Email sent via EmailJS'
      );

      return true;
    } catch (error) {
      logger.error({ error, to: options.to, subject: options.subject }, 'Failed to send email via EmailJS');
      return false;
    }
  }

  async sendEmailVerification(data: EmailVerificationData): Promise<boolean> {
    try {
      if (process.env.NODE_ENV === 'development') {
        if (data.verificationOTP) {
          // New OTP-based verification
          logger.info(
            {
              userEmail: data.userEmail,
              userName: data.userName,
              verificationOTP: data.verificationOTP,
              message: 'OTP-based email verification',
            },
            'Email verification OTP logged (development mode)'
          );
        } else {
          // Legacy token-based verification
          const verificationUrl = `${this.frontendUrl}/verify-email/${data.verificationToken}`;
          logger.info(
            {
              userEmail: data.userEmail,
              userName: data.userName,
              verificationUrl,
              message: 'Token-based email verification',
            },
            'Email verification logged (development mode)'
          );
        }
        return true;
      }

      let templateParams: any;

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
      } else {
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

      const response = await emailjs.send(
        this.serviceId,
        this.verificationTemplateId,
        templateParams,
        {
          publicKey: this.publicKey,
          privateKey: this.privateKey,
        }
      );

      logger.info(
        {
          messageId: response.text,
          to: data.userEmail,
          subject: 'Email Verification',
          type: data.verificationOTP ? 'OTP' : 'Token',
        },
        'Email verification sent via EmailJS'
      );

      return true;
    } catch (error) {
      logger.error(
        { error, to: data.userEmail },
        'Failed to send email verification via EmailJS'
      );
      return false;
    }
  }

  private formatOTP(otp: string): string {
    // Format OTP as "123 456" for better readability
    if (otp.length === 6) {
      return `${otp.substring(0, 3)} ${otp.substring(3)}`;
    }
    return otp;
  }

  async sendPasswordReset(data: PasswordResetData): Promise<boolean> {
    try {
      if (process.env.NODE_ENV === 'development') {
        const resetUrl = `${this.frontendUrl}/reset-password/${data.resetToken}`;
        logger.info(
          {
            userEmail: data.userEmail,
            userName: data.userName,
            resetUrl,
          },
          'Password reset email logged (development mode)'
        );
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

      const response = await emailjs.send(
        this.serviceId,
        this.passwordResetTemplateId,
        templateParams,
        {
          publicKey: this.publicKey,
          privateKey: this.privateKey,
        }
      );

      logger.info(
        {
          messageId: response.text,
          to: data.userEmail,
          subject: 'Password Reset',
        },
        'Password reset email sent via EmailJS'
      );

      return true;
    } catch (error) {
      logger.error(
        { error, to: data.userEmail },
        'Failed to send password reset email via EmailJS'
      );
      return false;
    }
  }
}

export const emailService = new EmailService();