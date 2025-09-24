#!/usr/bin/env tsx
/**
 * Check channels for messages and member data
 */
declare function checkChannelData(): Promise<{
    totalChannels: number;
    totalMessages: number;
    channelsWithMessages: number;
    channelsWithoutMessages: number;
    channels: {
        id: string;
        name: string;
        memberCount: number;
        members: string[];
    }[];
}>;
export { checkChannelData };
//# sourceMappingURL=check-channel-data.d.ts.map