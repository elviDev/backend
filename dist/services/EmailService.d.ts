export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}
export interface EmailVerificationData {
    userEmail: string;
    userName: string;
    verificationToken: string;
}
export interface PasswordResetData {
    userEmail: string;
    userName: string;
    resetToken: string;
}
declare class EmailService {
    private transporter;
    private readonly frontendUrl;
    constructor();
    private setupTransporter;
    sendEmail(options: EmailOptions): Promise<boolean>;
    sendEmailVerification(data: EmailVerificationData): Promise<boolean>;
    sendPasswordReset(data: PasswordResetData): Promise<boolean>;
}
export declare const emailService: EmailService;
export {};
//# sourceMappingURL=EmailService.d.ts.map