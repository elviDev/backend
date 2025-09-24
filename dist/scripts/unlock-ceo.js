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
exports.unlockCEOAccount = unlockCEOAccount;
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
/**
 * Unlock CEO account if it's locked
 */
async function unlockCEOAccount() {
    try {
        logger_1.logger.info('🔓 Unlocking CEO account...');
        // Find CEO user
        const usersResult = await index_1.userRepository.findMany({ limit: 100, offset: 0 });
        const users = usersResult.data;
        const ceoUser = users.find(user => user.role === 'ceo');
        if (!ceoUser) {
            logger_1.logger.error('❌ CEO user not found!');
            return false;
        }
        logger_1.logger.info(`👑 Found CEO: ${ceoUser.name} (${ceoUser.email})`);
        // Check if account is locked
        if (ceoUser.account_locked_until && ceoUser.account_locked_until > new Date()) {
            logger_1.logger.warn(`🔒 Account is locked until: ${ceoUser.account_locked_until}`);
            logger_1.logger.info(`📊 Failed login attempts: ${ceoUser.failed_login_attempts}`);
            // Unlock the account
            const unlocked = await index_1.userRepository.unlockAccount(ceoUser.id);
            if (unlocked) {
                logger_1.logger.info('✅ CEO account unlocked successfully!');
                console.log('\n✅ CEO ACCOUNT UNLOCKED');
                console.log('You can now login with:');
                console.log('Email: alex.ceo@company.com');
                console.log('Password: TestPass123!');
                return true;
            }
            else {
                logger_1.logger.error('❌ Failed to unlock CEO account');
                return false;
            }
        }
        else {
            logger_1.logger.info('✅ CEO account is not locked');
            console.log('\n✅ CEO ACCOUNT STATUS: UNLOCKED');
            console.log('You can login with:');
            console.log('Email: alex.ceo@company.com');
            console.log('Password: TestPass123!');
            return true;
        }
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to unlock CEO account:', error);
        throw error;
    }
}
// Run the script if this file is executed directly
if (require.main === module) {
    Promise.resolve().then(() => __importStar(require('@config/index'))).then(async () => {
        const { initializeDatabase } = await Promise.resolve().then(() => __importStar(require('@config/database')));
        await initializeDatabase();
        unlockCEOAccount().then((success) => {
            process.exit(success ? 0 : 1);
        }).catch((error) => {
            console.error('Script failed:', error);
            process.exit(1);
        });
    });
}
//# sourceMappingURL=unlock-ceo.js.map