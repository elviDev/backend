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
exports.getCEOInfo = getCEOInfo;
const index_1 = require("@db/index");
const logger_1 = require("@utils/logger");
/**
 * Get CEO user information including email and password hash
 */
async function getCEOInfo() {
    try {
        logger_1.logger.info('🔍 Looking for CEO user...');
        // Get all users and filter for CEO role
        const usersResult = await index_1.userRepository.findMany({ limit: 100, offset: 0 });
        const users = usersResult.data;
        const ceoUsers = users.filter(user => user.role === 'ceo');
        if (ceoUsers.length === 0) {
            logger_1.logger.warn('⚠️ No CEO users found!');
            return null;
        }
        if (ceoUsers.length > 1) {
            logger_1.logger.warn(`⚠️ Multiple CEO users found: ${ceoUsers.length}`);
        }
        const ceo = ceoUsers[0];
        logger_1.logger.info('👑 CEO User Found:');
        logger_1.logger.info(`  - Name: ${ceo.name}`);
        logger_1.logger.info(`  - Email: ${ceo.email}`);
        logger_1.logger.info(`  - ID: ${ceo.id}`);
        logger_1.logger.info(`  - Created: ${ceo.created_at}`);
        logger_1.logger.info(`  - Phone: ${ceo.phone || 'Not set'}`);
        logger_1.logger.info(`  - Department: ${ceo.department || 'Not set'}`);
        // Note: We should NOT expose password hashes for security reasons
        // But we can check if there's a default password pattern or provide guidance
        console.log('\n👑 CEO ACCOUNT INFORMATION:');
        console.log(`Name: ${ceo.name}`);
        console.log(`Email: ${ceo.email}`);
        console.log(`ID: ${ceo.id}`);
        console.log('\n🔐 PASSWORD SECURITY NOTE:');
        console.log('For security reasons, password hashes are not displayed.');
        console.log('If you need to reset the CEO password, please use the appropriate');
        console.log('password reset functionality or update the database directly.');
        return {
            name: ceo.name,
            email: ceo.email,
            id: ceo.id,
            phone: ceo.phone,
            department: ceo.department,
            created_at: ceo.created_at
        };
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to get CEO info:', error);
        throw error;
    }
}
// Run the check if this file is executed directly
if (require.main === module) {
    Promise.resolve().then(() => __importStar(require('@config/index'))).then(async () => {
        const { initializeDatabase } = await Promise.resolve().then(() => __importStar(require('@config/database')));
        await initializeDatabase();
        getCEOInfo().then((result) => {
            if (result) {
                console.log(`\n✅ CEO account found: ${result.email}`);
            }
            else {
                console.log('\n❌ No CEO account found in database');
            }
            process.exit(0);
        }).catch((error) => {
            console.error('Script failed:', error);
            process.exit(1);
        });
    });
}
//# sourceMappingURL=get-ceo-info.js.map