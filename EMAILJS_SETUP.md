# EmailJS Setup Guide

This application uses EmailJS for sending emails instead of traditional SMTP. Follow these steps to configure EmailJS:

## 1. Create EmailJS Account

1. Go to [EmailJS.com](https://www.emailjs.com/)
2. Create a free account
3. Verify your email address

## 2. Set up Email Service

1. In your EmailJS dashboard, go to **Email Services**
2. Click **Add New Service**
3. Choose your email provider (Gmail, Outlook, etc.)
4. Follow the setup instructions
5. Note down your **Service ID**

## 3. Create Email Templates

You need to create three templates:

### Email Verification Template (OTP-based)
- Template name: `Email Verification`
- Template ID: `template_verification`
- Template variables needed:
  - `{{to_email}}` - Recipient email
  - `{{user_name}}` - User's name
  - `{{verification_otp}}` - 6-digit OTP code
  - `{{otp_formatted}}` - Formatted OTP (e.g., "123 456")
  - `{{expires_in_minutes}}` - Expiry time in minutes (10)
  - `{{frontend_url}}` - Frontend URL

### Password Reset Template
- Template name: `Password Reset`
- Template ID: `template_password_reset`
- Template variables needed:
  - `{{to_email}}` - Recipient email
  - `{{user_name}}` - User's name
  - `{{reset_url}}` - Reset password link
  - `{{frontend_url}}` - Frontend URL

### Generic Email Template
- Template name: `Generic Email`
- Template ID: `template_generic`
- Template variables needed:
  - `{{to_email}}` - Recipient email
  - `{{subject}}` - Email subject
  - `{{html_content}}` - HTML content
  - `{{text_content}}` - Plain text content

## 4. Get API Keys

1. Go to **Account** in EmailJS dashboard
2. Note down your **Public Key**
3. Create a **Private Key** (recommended for server-side)

## 5. Configure Environment Variables

Add these to your `.env` file:

```env
# EmailJS Configuration
EMAILJS_SERVICE_ID=your_service_id
EMAILJS_PUBLIC_KEY=your_public_key
EMAILJS_PRIVATE_KEY=your_private_key
EMAILJS_VERIFICATION_TEMPLATE_ID=template_verification
EMAILJS_PASSWORD_RESET_TEMPLATE_ID=template_password_reset
EMAILJS_GENERIC_TEMPLATE_ID=template_generic
FROM_EMAIL=noreply@yourdomain.com
```

## 6. Template Examples

### Email Verification Template HTML (OTP-based):
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Verify Your Email</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .otp-code { 
            font-size: 32px; 
            font-weight: bold; 
            color: #007bff; 
            letter-spacing: 8px; 
            text-align: center; 
            background: #f8f9fa; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 20px 0;
        }
        .warning { color: #dc3545; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome, {{user_name}}!</h1>
        <p>Please verify your email address using the 6-digit code below:</p>
        
        <div class="otp-code">{{otp_formatted}}</div>
        
        <p>Enter this code on the verification page to complete your account setup.</p>
        
        <p class="warning">This code will expire in {{expires_in_minutes}} minutes.</p>
        
        <p>If you didn't create an account with us, please ignore this email.</p>
        
        <hr>
        <p><small>For security reasons, never share this code with anyone.</small></p>
    </div>
</body>
</html>
```

### Password Reset Template HTML:
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Password Reset</title>
</head>
<body>
    <h1>Password Reset Request</h1>
    <p>Hello {{user_name}},</p>
    <p>Click the link below to reset your password:</p>
    <a href="{{reset_url}}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none;">Reset Password</a>
    <p>Or copy this link: {{reset_url}}</p>
    <p>This link will expire in 1 hour.</p>
</body>
</html>
```

## 7. Testing

In development mode, emails are logged to the console instead of being sent. Set `NODE_ENV=production` to actually send emails via EmailJS.

## Notes

- EmailJS has a free tier with 200 emails/month
- For production, consider upgrading to a paid plan
- Test your templates in the EmailJS dashboard before deploying