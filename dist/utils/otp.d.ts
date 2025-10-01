/**
 * OTP Configuration
 */
export declare const OTP_CONFIG: {
    readonly LENGTH: 6;
    readonly EXPIRY_MINUTES: 10;
    readonly MAX_ATTEMPTS: 5;
    readonly LOCKOUT_MINUTES: 30;
};
/**
 * Generate a secure 6-digit OTP
 */
export declare function generateOTP(): string;
/**
 * Calculate OTP expiry timestamp
 */
export declare function getOTPExpiry(): Date;
/**
 * Check if OTP has expired
 */
export declare function isOTPExpired(expiryDate: Date | null): boolean;
/**
 * Validate OTP format (6 digits)
 */
export declare function isValidOTPFormat(otp: string): boolean;
/**
 * Compare OTPs securely to prevent timing attacks
 */
export declare function verifyOTP(providedOTP: string, storedOTP: string): boolean;
/**
 * Check if user has exceeded max OTP attempts
 */
export declare function hasExceededOTPAttempts(attempts: number): boolean;
/**
 * Calculate lockout expiry timestamp
 */
export declare function getOTPLockoutExpiry(): Date;
/**
 * Format OTP for display (e.g., "123 456")
 */
export declare function formatOTPForDisplay(otp: string): string;
/**
 * Get remaining time until OTP expires (in minutes)
 */
export declare function getOTPRemainingMinutes(expiryDate: Date | null): number;
/**
 * OTP validation result
 */
export interface OTPValidationResult {
    isValid: boolean;
    isExpired: boolean;
    attemptsRemaining: number;
    isLockedOut: boolean;
    lockoutExpiresAt?: Date;
    error?: string;
}
/**
 * Comprehensive OTP validation
 */
export declare function validateOTPAttempt(providedOTP: string, storedOTP: string | null, expiryDate: Date | null, attempts: number, lastAttemptAt?: Date | null): OTPValidationResult;
//# sourceMappingURL=otp.d.ts.map