"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OTP_CONFIG = void 0;
exports.generateOTP = generateOTP;
exports.getOTPExpiry = getOTPExpiry;
exports.isOTPExpired = isOTPExpired;
exports.isValidOTPFormat = isValidOTPFormat;
exports.verifyOTP = verifyOTP;
exports.hasExceededOTPAttempts = hasExceededOTPAttempts;
exports.getOTPLockoutExpiry = getOTPLockoutExpiry;
exports.formatOTPForDisplay = formatOTPForDisplay;
exports.getOTPRemainingMinutes = getOTPRemainingMinutes;
exports.validateOTPAttempt = validateOTPAttempt;
const crypto_1 = __importDefault(require("crypto"));
/**
 * OTP Configuration
 */
exports.OTP_CONFIG = {
    // OTP length (6 digits)
    LENGTH: 6,
    // OTP expiry time in minutes
    EXPIRY_MINUTES: 10,
    // Maximum OTP attempts before lockout
    MAX_ATTEMPTS: 5,
    // Lockout duration in minutes after max attempts
    LOCKOUT_MINUTES: 30,
};
/**
 * Generate a secure 6-digit OTP
 */
function generateOTP() {
    // Generate a random number between 100000 and 999999
    const min = Math.pow(10, exports.OTP_CONFIG.LENGTH - 1);
    const max = Math.pow(10, exports.OTP_CONFIG.LENGTH) - 1;
    // Use crypto.randomInt for cryptographically secure random number
    const otp = crypto_1.default.randomInt(min, max + 1);
    return otp.toString().padStart(exports.OTP_CONFIG.LENGTH, '0');
}
/**
 * Calculate OTP expiry timestamp
 */
function getOTPExpiry() {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + exports.OTP_CONFIG.EXPIRY_MINUTES);
    return expiry;
}
/**
 * Check if OTP has expired
 */
function isOTPExpired(expiryDate) {
    if (!expiryDate)
        return true;
    return new Date() > expiryDate;
}
/**
 * Validate OTP format (6 digits)
 */
function isValidOTPFormat(otp) {
    const otpPattern = new RegExp(`^[0-9]{${exports.OTP_CONFIG.LENGTH}}$`);
    return otpPattern.test(otp);
}
/**
 * Compare OTPs securely to prevent timing attacks
 */
function verifyOTP(providedOTP, storedOTP) {
    if (!isValidOTPFormat(providedOTP) || !isValidOTPFormat(storedOTP)) {
        return false;
    }
    // Use crypto.timingSafeEqual for secure comparison
    const providedBuffer = Buffer.from(providedOTP, 'utf8');
    const storedBuffer = Buffer.from(storedOTP, 'utf8');
    try {
        return crypto_1.default.timingSafeEqual(providedBuffer, storedBuffer);
    }
    catch (error) {
        // Buffers have different lengths
        return false;
    }
}
/**
 * Check if user has exceeded max OTP attempts
 */
function hasExceededOTPAttempts(attempts) {
    return attempts >= exports.OTP_CONFIG.MAX_ATTEMPTS;
}
/**
 * Calculate lockout expiry timestamp
 */
function getOTPLockoutExpiry() {
    const lockoutExpiry = new Date();
    lockoutExpiry.setMinutes(lockoutExpiry.getMinutes() + exports.OTP_CONFIG.LOCKOUT_MINUTES);
    return lockoutExpiry;
}
/**
 * Format OTP for display (e.g., "123 456")
 */
function formatOTPForDisplay(otp) {
    if (!isValidOTPFormat(otp))
        return otp;
    return otp.substring(0, 3) + ' ' + otp.substring(3);
}
/**
 * Get remaining time until OTP expires (in minutes)
 */
function getOTPRemainingMinutes(expiryDate) {
    if (!expiryDate)
        return 0;
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    if (diffMs <= 0)
        return 0;
    return Math.ceil(diffMs / (1000 * 60));
}
/**
 * Comprehensive OTP validation
 */
function validateOTPAttempt(providedOTP, storedOTP, expiryDate, attempts, lastAttemptAt) {
    const result = {
        isValid: false,
        isExpired: false,
        attemptsRemaining: Math.max(0, exports.OTP_CONFIG.MAX_ATTEMPTS - attempts),
        isLockedOut: false,
    };
    // Check if user is locked out
    if (hasExceededOTPAttempts(attempts)) {
        result.isLockedOut = true;
        result.lockoutExpiresAt = getOTPLockoutExpiry();
        result.error = `Too many attempts. Please try again after ${exports.OTP_CONFIG.LOCKOUT_MINUTES} minutes.`;
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
        result.attemptsRemaining = Math.max(0, exports.OTP_CONFIG.MAX_ATTEMPTS - attempts - 1);
        result.error = `Invalid OTP. ${result.attemptsRemaining} attempts remaining.`;
        return result;
    }
    // OTP is valid
    result.isValid = true;
    return result;
}
//# sourceMappingURL=otp.js.map