import crypto from 'crypto';

/**
 * OTP Configuration
 */
export const OTP_CONFIG = {
  // OTP length (6 digits)
  LENGTH: 6,
  // OTP expiry time in minutes
  EXPIRY_MINUTES: 10,
  // Maximum OTP attempts before lockout
  MAX_ATTEMPTS: 5,
  // Lockout duration in minutes after max attempts
  LOCKOUT_MINUTES: 30,
} as const;

/**
 * Generate a secure 6-digit OTP
 */
export function generateOTP(): string {
  // Generate a random number between 100000 and 999999
  const min = Math.pow(10, OTP_CONFIG.LENGTH - 1);
  const max = Math.pow(10, OTP_CONFIG.LENGTH) - 1;
  
  // Use crypto.randomInt for cryptographically secure random number
  const otp = crypto.randomInt(min, max + 1);
  
  return otp.toString().padStart(OTP_CONFIG.LENGTH, '0');
}

/**
 * Calculate OTP expiry timestamp
 */
export function getOTPExpiry(): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + OTP_CONFIG.EXPIRY_MINUTES);
  return expiry;
}

/**
 * Check if OTP has expired
 */
export function isOTPExpired(expiryDate: Date | null): boolean {
  if (!expiryDate) return true;
  return new Date() > expiryDate;
}

/**
 * Validate OTP format (6 digits)
 */
export function isValidOTPFormat(otp: string): boolean {
  const otpPattern = new RegExp(`^[0-9]{${OTP_CONFIG.LENGTH}}$`);
  return otpPattern.test(otp);
}

/**
 * Compare OTPs securely to prevent timing attacks
 */
export function verifyOTP(providedOTP: string, storedOTP: string): boolean {
  if (!isValidOTPFormat(providedOTP) || !isValidOTPFormat(storedOTP)) {
    return false;
  }
  
  // Use crypto.timingSafeEqual for secure comparison
  const providedBuffer = Buffer.from(providedOTP, 'utf8');
  const storedBuffer = Buffer.from(storedOTP, 'utf8');
  
  try {
    return crypto.timingSafeEqual(providedBuffer, storedBuffer);
  } catch (error) {
    // Buffers have different lengths
    return false;
  }
}

/**
 * Check if user has exceeded max OTP attempts
 */
export function hasExceededOTPAttempts(attempts: number): boolean {
  return attempts >= OTP_CONFIG.MAX_ATTEMPTS;
}

/**
 * Calculate lockout expiry timestamp
 */
export function getOTPLockoutExpiry(): Date {
  const lockoutExpiry = new Date();
  lockoutExpiry.setMinutes(lockoutExpiry.getMinutes() + OTP_CONFIG.LOCKOUT_MINUTES);
  return lockoutExpiry;
}

/**
 * Format OTP for display (e.g., "123 456")
 */
export function formatOTPForDisplay(otp: string): string {
  if (!isValidOTPFormat(otp)) return otp;
  
  return otp.substring(0, 3) + ' ' + otp.substring(3);
}

/**
 * Get remaining time until OTP expires (in minutes)
 */
export function getOTPRemainingMinutes(expiryDate: Date | null): number {
  if (!expiryDate) return 0;
  
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  
  if (diffMs <= 0) return 0;
  
  return Math.ceil(diffMs / (1000 * 60));
}

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
export function validateOTPAttempt(
  providedOTP: string,
  storedOTP: string | null,
  expiryDate: Date | null,
  attempts: number,
  lastAttemptAt?: Date | null
): OTPValidationResult {
  const result: OTPValidationResult = {
    isValid: false,
    isExpired: false,
    attemptsRemaining: Math.max(0, OTP_CONFIG.MAX_ATTEMPTS - attempts),
    isLockedOut: false,
  };

  // Check if user is locked out
  if (hasExceededOTPAttempts(attempts)) {
    result.isLockedOut = true;
    result.lockoutExpiresAt = getOTPLockoutExpiry();
    result.error = `Too many attempts. Please try again after ${OTP_CONFIG.LOCKOUT_MINUTES} minutes.`;
    return result;
  }

  // Check OTP format
  if (!isValidOTPFormat(providedOTP)) {
    result.error = 'Invalid OTP format. Please enter a 6-digit code.';
    return result;
  }

  // Check if OTP exists
  if (!storedOTP) {
    result.error = 'No OTP found. Please request a new verification code.';
    return result;
  }

  // Check if OTP has expired
  if (isOTPExpired(expiryDate)) {
    result.isExpired = true;
    result.error = 'OTP has expired. Please request a new verification code.';
    return result;
  }

  // Verify OTP
  if (!verifyOTP(providedOTP, storedOTP)) {
    result.attemptsRemaining = Math.max(0, OTP_CONFIG.MAX_ATTEMPTS - attempts - 1);
    result.error = `Invalid OTP. ${result.attemptsRemaining} attempts remaining.`;
    return result;
  }

  // OTP is valid
  result.isValid = true;
  return result;
}