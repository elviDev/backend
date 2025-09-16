"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedChannels = seedChannels;
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const ChannelRepository_1 = __importDefault(require("../db/ChannelRepository"));
const channelRepository = new ChannelRepository_1.default();
/**
 * Seed channels for development and testing
 */
async function seedChannels() {
    try {
        logger_1.logger.info('Starting channel seeding...');
        // Initialize database connection
        await (0, database_1.initializeDatabase)();
        // Test database connection
        const testResult = await (0, database_1.query)('SELECT NOW()');
        logger_1.logger.info('Database connection test:', testResult.rows[0]);
        // Check if any channels exist
        const existingChannels = await (0, database_1.query)('SELECT COUNT(*) as count FROM channels WHERE deleted_at IS NULL');
        const channelCount = parseInt(existingChannels.rows[0].count, 10);
        if (channelCount > 0) {
            logger_1.logger.info(`Found ${channelCount} existing channels, skipping seed`);
            return;
        }
        // Get users to assign as channel owners and members
        const usersResult = await (0, database_1.query)('SELECT id, email, role FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 10');
        const users = usersResult.rows;
        if (users.length === 0) {
            logger_1.logger.warn('No users found, cannot seed channels without users');
            return;
        }
        // Find admin/CEO user for some channels
        const adminUser = users.find(u => u.role === 'ceo') || users[0];
        const managerUsers = users.filter(u => u.role === 'manager') || users.slice(0, 2);
        const staffUsers = users.filter(u => u.role === 'staff') || users;
        const seedChannels = [
            {
                name: 'General Discussion',
                description: 'Main channel for general company discussions, announcements, and team updates.',
                channel_type: 'announcement',
                privacy_level: 'public',
                created_by: adminUser.id,
                members: users.map(u => u.id),
                moderators: [adminUser.id, ...managerUsers.slice(0, 2).map(u => u.id)],
                settings: {
                    allow_voice_commands: true,
                    voice_command_roles: ['ceo', 'manager'],
                    allow_file_uploads: true,
                    allow_external_sharing: false,
                    message_retention_days: 365,
                    require_approval_for_join: false,
                    notification_level: 'all',
                    read_receipts_enabled: true,
                    typing_indicators_enabled: true,
                    thread_replies_enabled: true,
                    message_reactions_enabled: true,
                    voice_transcription_enabled: true,
                },
                project_info: {
                    priority: 'high',
                    tags: ['general', 'announcements', 'company-wide'],
                    stakeholders: users.map(u => u.id),
                },
            },
            {
                name: 'Project Alpha Development',
                description: 'Development discussions, progress updates, and technical coordination for Project Alpha.',
                channel_type: 'project',
                privacy_level: 'private',
                created_by: managerUsers[0]?.id || adminUser.id,
                members: [adminUser.id, ...managerUsers.slice(0, 2).map(u => u.id), ...staffUsers.slice(0, 4).map(u => u.id)],
                moderators: [managerUsers[0]?.id || adminUser.id, adminUser.id],
                settings: {
                    allow_voice_commands: true,
                    voice_command_roles: ['ceo', 'manager'],
                    allow_file_uploads: true,
                    allow_external_sharing: false,
                    message_retention_days: 90,
                    require_approval_for_join: true,
                    notification_level: 'all',
                    read_receipts_enabled: true,
                    typing_indicators_enabled: true,
                    thread_replies_enabled: true,
                    message_reactions_enabled: true,
                    voice_transcription_enabled: true,
                },
                project_info: {
                    start_date: new Date().toISOString(),
                    end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days from now
                    priority: 'high',
                    tags: ['development', 'project-alpha', 'backend', 'frontend'],
                    milestones: [
                        {
                            name: 'MVP Complete',
                            date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                            status: 'pending',
                        },
                        {
                            name: 'Beta Testing',
                            date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                            status: 'pending',
                        },
                        {
                            name: 'Production Release',
                            date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
                            status: 'pending',
                        },
                    ],
                    deliverables: [
                        'API Documentation',
                        'Frontend Application',
                        'Backend Services',
                        'Testing Suite',
                        'Deployment Pipeline',
                    ],
                    stakeholders: [adminUser.id, ...managerUsers.slice(0, 2).map(u => u.id)],
                },
            },
            {
                name: 'Marketing Team',
                description: 'Marketing strategies, campaigns, content planning, and brand discussions.',
                channel_type: 'department',
                privacy_level: 'restricted',
                created_by: managerUsers[1]?.id || adminUser.id,
                members: [adminUser.id, managerUsers[1]?.id || adminUser.id, ...staffUsers.slice(2, 5).map(u => u.id)],
                moderators: [managerUsers[1]?.id || adminUser.id],
                settings: {
                    allow_voice_commands: true,
                    voice_command_roles: ['ceo', 'manager'],
                    allow_file_uploads: true,
                    allow_external_sharing: true,
                    message_retention_days: 180,
                    require_approval_for_join: true,
                    notification_level: 'mentions',
                    read_receipts_enabled: false,
                    typing_indicators_enabled: true,
                    thread_replies_enabled: true,
                    message_reactions_enabled: true,
                    voice_transcription_enabled: false,
                },
                project_info: {
                    priority: 'medium',
                    tags: ['marketing', 'campaigns', 'content', 'social-media'],
                    stakeholders: [adminUser.id, managerUsers[1]?.id || adminUser.id],
                },
            },
            {
                name: 'Design System',
                description: 'UI/UX design discussions, component library updates, and design system maintenance.',
                channel_type: 'initiative',
                privacy_level: 'public',
                created_by: staffUsers[0]?.id || adminUser.id,
                members: [adminUser.id, ...staffUsers.slice(0, 3).map(u => u.id)],
                moderators: [staffUsers[0]?.id || adminUser.id],
                settings: {
                    allow_voice_commands: false,
                    voice_command_roles: [],
                    allow_file_uploads: true,
                    allow_external_sharing: false,
                    message_retention_days: 60,
                    require_approval_for_join: false,
                    notification_level: 'mentions',
                    read_receipts_enabled: false,
                    typing_indicators_enabled: true,
                    thread_replies_enabled: true,
                    message_reactions_enabled: true,
                    voice_transcription_enabled: false,
                },
                project_info: {
                    priority: 'medium',
                    tags: ['design', 'ui', 'ux', 'components', 'style-guide'],
                    deliverables: [
                        'Component Library',
                        'Design Tokens',
                        'Usage Guidelines',
                        'Figma Templates',
                    ],
                    stakeholders: [staffUsers[0]?.id || adminUser.id],
                },
            },
            {
                name: 'Random & Fun',
                description: 'Casual conversations, memes, team bonding, and non-work related discussions.',
                channel_type: 'temporary',
                privacy_level: 'public',
                created_by: staffUsers[1]?.id || adminUser.id,
                members: users.map(u => u.id),
                moderators: [staffUsers[1]?.id || adminUser.id],
                settings: {
                    allow_voice_commands: false,
                    voice_command_roles: [],
                    allow_file_uploads: true,
                    allow_external_sharing: false,
                    message_retention_days: 30,
                    require_approval_for_join: false,
                    notification_level: 'none',
                    read_receipts_enabled: false,
                    typing_indicators_enabled: true,
                    thread_replies_enabled: false,
                    message_reactions_enabled: true,
                    voice_transcription_enabled: false,
                },
                project_info: {
                    priority: 'low',
                    tags: ['social', 'fun', 'casual', 'team-bonding'],
                    stakeholders: [staffUsers[1]?.id || adminUser.id],
                },
            },
            {
                name: 'Q4 Planning Initiative',
                description: 'Strategic planning, goal setting, and resource allocation for Q4 objectives.',
                channel_type: 'initiative',
                privacy_level: 'restricted',
                created_by: adminUser.id,
                members: [adminUser.id, ...managerUsers.map(u => u.id)],
                moderators: [adminUser.id],
                settings: {
                    allow_voice_commands: true,
                    voice_command_roles: ['ceo', 'manager'],
                    allow_file_uploads: true,
                    allow_external_sharing: false,
                    message_retention_days: 120,
                    require_approval_for_join: true,
                    notification_level: 'all',
                    read_receipts_enabled: true,
                    typing_indicators_enabled: true,
                    thread_replies_enabled: true,
                    message_reactions_enabled: false,
                    voice_transcription_enabled: true,
                },
                project_info: {
                    start_date: new Date().toISOString(),
                    end_date: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(), // 120 days from now
                    priority: 'high',
                    tags: ['planning', 'strategy', 'quarterly', 'goals', 'leadership'],
                    milestones: [
                        {
                            name: 'Goal Setting Complete',
                            date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                            status: 'pending',
                        },
                        {
                            name: 'Resource Allocation',
                            date: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
                            status: 'pending',
                        },
                        {
                            name: 'Implementation Begin',
                            date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
                            status: 'pending',
                        },
                    ],
                    deliverables: [
                        'Q4 Strategic Plan',
                        'Budget Allocation',
                        'Team Assignments',
                        'Success Metrics',
                        'Timeline & Milestones',
                    ],
                    stakeholders: [adminUser.id, ...managerUsers.map(u => u.id)],
                },
            },
        ];
        // Create categories if they don't exist (skip if categories table doesn't exist)
        try {
            const categoriesResult = await (0, database_1.query)('SELECT COUNT(*) as count FROM categories WHERE deleted_at IS NULL');
            const categoryCount = parseInt(categoriesResult.rows[0].count, 10);
            if (categoryCount === 0) {
                logger_1.logger.info('Creating default categories...');
                const defaultCategories = [
                    { name: 'General', description: 'General discussions and announcements', color: '#6B7280' },
                    { name: 'Projects', description: 'Project-specific channels', color: '#10B981' },
                    { name: 'Departments', description: 'Department and team channels', color: '#3B82F6' },
                    { name: 'Initiatives', description: 'Special initiatives and programs', color: '#8B5CF6' },
                    { name: 'Social', description: 'Social and casual discussions', color: '#F59E0B' },
                ];
                for (const category of defaultCategories) {
                    await (0, database_1.query)('INSERT INTO categories (name, description, metadata) VALUES ($1, $2, $3)', [category.name, category.description, JSON.stringify({ color: category.color })]);
                }
                logger_1.logger.info(`Created ${defaultCategories.length} categories`);
            }
        }
        catch (error) {
            logger_1.logger.warn('Categories table may not exist, skipping category creation');
        }
        // Create channels
        let createdCount = 0;
        for (const channelData of seedChannels) {
            try {
                const channel = await channelRepository.createChannel({
                    name: channelData.name,
                    description: channelData.description,
                    channel_type: channelData.channel_type,
                    privacy_level: channelData.privacy_level,
                    created_by: channelData.created_by,
                    members: channelData.members,
                    moderators: channelData.moderators,
                    settings: channelData.settings,
                    project_info: channelData.project_info,
                });
                // Add some initial activity stats
                await (0, database_1.query)(`UPDATE channels SET activity_stats = $1 WHERE id = $2`, [
                    JSON.stringify({
                        total_messages: Math.floor(Math.random() * 50) + 1,
                        total_files: Math.floor(Math.random() * 10),
                        total_tasks: Math.floor(Math.random() * 5),
                        last_activity: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
                        most_active_user: channelData.members[Math.floor(Math.random() * channelData.members.length)],
                        average_response_time: Math.floor(Math.random() * 120) + 30, // 30-150 minutes
                        peak_activity_hours: ['09:00', '10:00', '14:00', '15:00'],
                    }),
                    channel.id,
                ]);
                logger_1.logger.info(`Created channel: ${channel.name} (${channel.id})`);
                createdCount++;
            }
            catch (error) {
                logger_1.logger.error(`Failed to create channel ${channelData.name}:`, error);
            }
        }
        logger_1.logger.info(`Channel seeding completed: ${createdCount}/${seedChannels.length} channels created`);
    }
    catch (error) {
        logger_1.logger.error('Channel seeding failed:', error);
        console.error('Full error details:', error);
        throw error;
    }
}
// Run if called directly
if (require.main === module) {
    seedChannels()
        .then(() => {
        logger_1.logger.info('Channel seeding script completed successfully');
        process.exit(0);
    })
        .catch((error) => {
        logger_1.logger.error('Channel seeding script failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=seed-channels.js.map