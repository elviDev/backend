"use strict";
/**
 * Database layer exports
 * Centralized access to all repositories and database utilities
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMigrations = exports.getMigrationStatus = exports.rollbackLastMigration = exports.runMigrations = exports.DatabaseManager = exports.databaseMetrics = exports.getPoolStats = exports.healthCheck = exports.transaction = exports.query = exports.getPool = exports.closeDatabase = exports.initializeDatabase = exports.repositories = exports.reactionRepository = exports.threadRepository = exports.commentRepository = exports.announcementRepository = exports.fileRepository = exports.activityRepository = exports.messageRepository = exports.taskRepository = exports.channelRepository = exports.userRepository = exports.ReactionRepository = exports.ThreadRepository = exports.CommentRepository = exports.AnnouncementRepository = exports.FileRepository = exports.ActivityRepository = exports.MessageRepository = exports.TaskRepository = exports.ChannelRepository = exports.UserRepository = exports.BaseRepository = void 0;
// Base repository
var BaseRepository_1 = require("./BaseRepository");
Object.defineProperty(exports, "BaseRepository", { enumerable: true, get: function () { return __importDefault(BaseRepository_1).default; } });
// Specialized repositories
var UserRepository_1 = require("./UserRepository");
Object.defineProperty(exports, "UserRepository", { enumerable: true, get: function () { return __importDefault(UserRepository_1).default; } });
var ChannelRepository_1 = require("./ChannelRepository");
Object.defineProperty(exports, "ChannelRepository", { enumerable: true, get: function () { return __importDefault(ChannelRepository_1).default; } });
var TaskRepository_1 = require("./TaskRepository");
Object.defineProperty(exports, "TaskRepository", { enumerable: true, get: function () { return __importDefault(TaskRepository_1).default; } });
var MessageRepository_1 = require("./MessageRepository");
Object.defineProperty(exports, "MessageRepository", { enumerable: true, get: function () { return __importDefault(MessageRepository_1).default; } });
var ActivityRepository_1 = require("./ActivityRepository");
Object.defineProperty(exports, "ActivityRepository", { enumerable: true, get: function () { return __importDefault(ActivityRepository_1).default; } });
var FileRepository_1 = require("./FileRepository");
Object.defineProperty(exports, "FileRepository", { enumerable: true, get: function () { return __importDefault(FileRepository_1).default; } });
var AnnouncementRepository_1 = require("./AnnouncementRepository");
Object.defineProperty(exports, "AnnouncementRepository", { enumerable: true, get: function () { return __importDefault(AnnouncementRepository_1).default; } });
var CommentRepository_1 = require("./CommentRepository");
Object.defineProperty(exports, "CommentRepository", { enumerable: true, get: function () { return CommentRepository_1.CommentRepository; } });
var ThreadRepository_1 = require("./ThreadRepository");
Object.defineProperty(exports, "ThreadRepository", { enumerable: true, get: function () { return __importDefault(ThreadRepository_1).default; } });
var ReactionRepository_1 = require("./ReactionRepository");
Object.defineProperty(exports, "ReactionRepository", { enumerable: true, get: function () { return __importDefault(ReactionRepository_1).default; } });
// Repository instances for dependency injection
const UserRepository_2 = __importDefault(require("./UserRepository"));
const ChannelRepository_2 = __importDefault(require("./ChannelRepository"));
const TaskRepository_2 = __importDefault(require("./TaskRepository"));
const MessageRepository_2 = __importDefault(require("./MessageRepository"));
const ActivityRepository_2 = __importDefault(require("./ActivityRepository"));
const FileRepository_2 = __importDefault(require("./FileRepository"));
const AnnouncementRepository_2 = __importDefault(require("./AnnouncementRepository"));
const CommentRepository_2 = require("./CommentRepository");
const ThreadRepository_2 = __importDefault(require("./ThreadRepository"));
const ReactionRepository_2 = __importDefault(require("./ReactionRepository"));
// Create singleton instances
exports.userRepository = new UserRepository_2.default();
exports.channelRepository = new ChannelRepository_2.default();
exports.taskRepository = new TaskRepository_2.default();
exports.messageRepository = new MessageRepository_2.default();
exports.activityRepository = new ActivityRepository_2.default();
exports.fileRepository = new FileRepository_2.default();
exports.announcementRepository = new AnnouncementRepository_2.default();
exports.commentRepository = new CommentRepository_2.CommentRepository();
exports.threadRepository = new ThreadRepository_2.default();
exports.reactionRepository = new ReactionRepository_2.default();
// Repository collection for easy access
exports.repositories = {
    users: exports.userRepository,
    channels: exports.channelRepository,
    tasks: exports.taskRepository,
    messages: exports.messageRepository,
    activities: exports.activityRepository,
    files: exports.fileRepository,
    announcements: exports.announcementRepository,
    comments: exports.commentRepository,
    threads: exports.threadRepository,
    reactions: exports.reactionRepository,
};
// Database configuration and utilities
var database_1 = require("../config/database");
Object.defineProperty(exports, "initializeDatabase", { enumerable: true, get: function () { return database_1.initializeDatabase; } });
Object.defineProperty(exports, "closeDatabase", { enumerable: true, get: function () { return database_1.closeDatabase; } });
Object.defineProperty(exports, "getPool", { enumerable: true, get: function () { return database_1.getPool; } });
Object.defineProperty(exports, "query", { enumerable: true, get: function () { return database_1.query; } });
Object.defineProperty(exports, "transaction", { enumerable: true, get: function () { return database_1.transaction; } });
Object.defineProperty(exports, "healthCheck", { enumerable: true, get: function () { return database_1.healthCheck; } });
Object.defineProperty(exports, "getPoolStats", { enumerable: true, get: function () { return database_1.getPoolStats; } });
Object.defineProperty(exports, "databaseMetrics", { enumerable: true, get: function () { return database_1.databaseMetrics; } });
// DatabaseManager class for Phase 2 compatibility
class DatabaseManager {
    static instance;
    static getInstance() {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }
    async query(text, params, client) {
        const { query } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        return await query(text, params, client);
    }
    async one(text, params, client) {
        const result = await this.query(text, params, client);
        if (result.rows.length === 0) {
            throw new Error('No rows returned');
        }
        return result.rows[0];
    }
    async many(text, params, client) {
        const result = await this.query(text, params, client);
        return result.rows;
    }
    async none(text, params, client) {
        await this.query(text, params, client);
    }
    async transaction(callback) {
        const { transaction } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        return await transaction(callback);
    }
}
exports.DatabaseManager = DatabaseManager;
// Migration system
var migrator_1 = require("./migrator");
Object.defineProperty(exports, "runMigrations", { enumerable: true, get: function () { return migrator_1.runMigrations; } });
Object.defineProperty(exports, "rollbackLastMigration", { enumerable: true, get: function () { return migrator_1.rollbackLastMigration; } });
Object.defineProperty(exports, "getMigrationStatus", { enumerable: true, get: function () { return migrator_1.getMigrationStatus; } });
Object.defineProperty(exports, "validateMigrations", { enumerable: true, get: function () { return migrator_1.validateMigrations; } });
exports.default = exports.repositories;
//# sourceMappingURL=index.js.map