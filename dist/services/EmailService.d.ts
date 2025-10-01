export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}
export interface EmailVerificationData {
    userEmail: string;
    userName: string;
    verificationToken?: string;
    verificationOTP?: string;
}
export interface PasswordResetData {
    userEmail: string;
    userName: string;
    resetToken: string;
}
declare class EmailService {
    private readonly frontendUrl;
    private readonly serviceId;
    private readonly publicKey;
    private readonly privateKey;
    private readonly verificationTemplateId;
    private readonly passwordResetTemplateId;
    constructor();
    sendEmail(options: EmailOptions): Promise<boolean>;
    sendEmailVerification(data: EmailVerificationData): Promise<boolean>;
    private formatOTP;
    sendPasswordReset(data: PasswordResetData): Promise<boolean>;
}
export declare const emailService: EmailService;
export {};
//# sourceMappingURL=EmailService.d.ts.map