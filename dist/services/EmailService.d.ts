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
export interface ChannelMemberData {
    userEmail: string;
    userName: string;
    channelName: string;
    channelDescription?: string;
    addedByName: string;
}
export interface TaskAssignmentData {
    userEmail: string;
    userName: string;
    taskTitle: string;
    taskDescription?: string;
    assignedByName: string;
    dueDate?: string;
    priority?: string;
}
export interface TaskStatusChangeData {
    userEmail: string;
    userName: string;
    taskTitle: string;
    oldStatus: string;
    newStatus: string;
    changedByName: string;
}
export interface WelcomeEmailData {
    userEmail: string;
    userName: string;
    role: string;
}
declare class EmailService {
    private resend;
    private readonly frontendUrl;
    private readonly fromEmail;
    private readonly fromName;
    constructor();
    sendEmail(options: EmailOptions): Promise<boolean>;
    sendWelcomeEmail(data: WelcomeEmailData): Promise<boolean>;
    sendEmailVerification(data: EmailVerificationData): Promise<boolean>;
    sendVerificationLinkResend(data: EmailVerificationData): Promise<boolean>;
    sendPasswordReset(data: PasswordResetData): Promise<boolean>;
    sendChannelMemberAdded(data: ChannelMemberData): Promise<boolean>;
    sendTaskAssigned(data: TaskAssignmentData): Promise<boolean>;
    sendTaskStatusChanged(data: TaskStatusChangeData): Promise<boolean>;
}
export declare const emailService: EmailService;
export {};
//# sourceMappingURL=EmailService.d.ts.map