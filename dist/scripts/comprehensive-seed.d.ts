/**
 * Comprehensive Database Seeding Script
 * Clears all data and creates robust test data for thorough application testing
 */
declare class ComprehensiveSeeder {
    private users;
    private channels;
    private messages;
    private tasks;
    run(): Promise<void>;
    /**
     * Clear all data from all tables in correct order (respecting foreign keys)
     */
    private clearAllData;
    /**
     * Create 5 test users: 1 CEO, 2 Managers, 2 Staff
     */
    private createUsers;
    /**
     * Create 5 channels in different categories
     */
    private createChannels;
    /**
     * Create messages, threads, and replies for each channel
     * Each channel gets: 5 messages, 3 threads (for 3 different messages), 6 replies total
     */
    private createMessagesAndThreads;
    /**
     * Create 3 tasks per channel with 5 comments each
     */
    private createTasksAndComments;
    /**
     * Add reactions to messages
     */
    private createReactions;
    /**
     * Generate notifications and activities for all users (minimum 5 each)
     */
    private createNotificationsAndActivities;
    private getNotificationTitle;
    private getNotificationMessage;
    private getActivityTitle;
    private getActivityDescription;
    /**
     * Generate a summary report of all created data
     */
    private generateSummaryReport;
}
export default ComprehensiveSeeder;
//# sourceMappingURL=comprehensive-seed.d.ts.map