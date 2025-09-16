/**
 * Test setup and configuration
 * Sets up test database, mocks, and global test utilities
 */
export declare const createTestUser: (overrides?: any) => any;
export declare const createTestChannel: (overrides?: any) => any;
export declare const createTestTask: (overrides?: any) => any;
export declare const createMockRequest: (overrides?: any) => any;
export declare const createMockReply: () => {
    code: jest.Mock<any, any, any>;
    send: jest.Mock<any, any, any>;
    header: jest.Mock<any, any, any>;
    addHook: jest.Mock<any, any, any>;
};
export declare const measureExecutionTime: (operation: () => Promise<any>) => Promise<{
    result: any;
    duration: number;
}>;
export declare const cleanupTestData: () => Promise<void>;
export declare const validatePerformanceBenchmark: (duration: number, benchmark: number, operation: string) => void;
export declare const validateSuccessCriteria: {
    simpleCommandSpeed: (duration: number) => void;
    complexCommandSpeed: (duration: number) => void;
    realTimeUpdate: (duration: number) => void;
    notificationDelivery: (duration: number) => void;
    messageDelivery: (duration: number) => void;
};
declare const _default: {
    createTestUser: (overrides?: any) => any;
    createTestChannel: (overrides?: any) => any;
    createTestTask: (overrides?: any) => any;
    createMockRequest: (overrides?: any) => any;
    createMockReply: () => {
        code: jest.Mock<any, any, any>;
        send: jest.Mock<any, any, any>;
        header: jest.Mock<any, any, any>;
        addHook: jest.Mock<any, any, any>;
    };
    measureExecutionTime: (operation: () => Promise<any>) => Promise<{
        result: any;
        duration: number;
    }>;
    validateSuccessCriteria: {
        simpleCommandSpeed: (duration: number) => void;
        complexCommandSpeed: (duration: number) => void;
        realTimeUpdate: (duration: number) => void;
        notificationDelivery: (duration: number) => void;
        messageDelivery: (duration: number) => void;
    };
};
export default _default;
//# sourceMappingURL=setup.d.ts.map