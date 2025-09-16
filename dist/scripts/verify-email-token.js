#!/usr/bin/env tsx
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
/**
 * Development script to manually verify email tokens
 * Useful when emails are logged to console instead of sent
 */
async function verifyEmailToken(token) {
    try {
        logger_1.logger.info(`Attempting to verify email with token: ${token}`);
        const user = await index_1.userRepository.verifyEmail(token);
        if (user) {
            logger_1.logger.info({
                userId: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }, 'Email verified successfully! User can now log in.');
            console.log('\n✅ EMAIL VERIFICATION SUCCESSFUL!');
            console.log(`User: ${user.name} (${user.email})`);
            console.log(`Role: ${user.role}`);
            console.log('The user can now log in to the application.\n');
        }
        else {
            logger_1.logger.warn('Invalid or expired verification token');
            console.log('\n❌ VERIFICATION FAILED!');
            console.log('Token is either invalid or expired.\n');
        }
    }
    catch (error) {
        logger_1.logger.error({ error, token }, 'Failed to verify email token');
        console.log('\n❌ VERIFICATION ERROR!');
        console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    }
}
// Get token from command line argument
const token = process.argv[2];
if (!token) {
    console.log('\n📧 Email Token Verification Tool');
    console.log('Usage: npx tsx src/scripts/verify-email-token.ts <TOKEN>');
    console.log('\nExample:');
    console.log('npx tsx src/scripts/verify-email-token.ts eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\n');
    process.exit(1);
}
// Initialize database connection and verify token
Promise.resolve().then(() => __importStar(require('@config/index'))).then(() => {
    verifyEmailToken(token).then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Script failed:', error);
        process.exit(1);
    });
});
//# sourceMappingURL=verify-email-token.js.map