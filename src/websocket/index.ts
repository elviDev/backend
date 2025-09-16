/**
 * WebSocket module exports
 * Real-time communication infrastructure for the CEO Communication Platform
 */

import { socketManager } from './SocketManager';
import { WebSocketUtils, EventBuilder } from './utils';

export { socketManager, SocketManager } from './SocketManager';
export { WebSocketUtils, EventBuilder } from './utils';
export * from './types';

// Re-export for easy access - only public API
export default {
  WebSocketUtils,
  EventBuilder,
};