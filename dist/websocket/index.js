"use strict";
/**
 * WebSocket module exports
 * Real-time communication infrastructure for the CEO Communication Platform
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBuilder = exports.WebSocketUtils = exports.SocketManager = exports.socketManager = void 0;
const utils_1 = require("./utils");
var SocketManager_1 = require("./SocketManager");
Object.defineProperty(exports, "socketManager", { enumerable: true, get: function () { return SocketManager_1.socketManager; } });
Object.defineProperty(exports, "SocketManager", { enumerable: true, get: function () { return SocketManager_1.SocketManager; } });
var utils_2 = require("./utils");
Object.defineProperty(exports, "WebSocketUtils", { enumerable: true, get: function () { return utils_2.WebSocketUtils; } });
Object.defineProperty(exports, "EventBuilder", { enumerable: true, get: function () { return utils_2.EventBuilder; } });
__exportStar(require("./types"), exports);
// Re-export for easy access - only public API
exports.default = {
    WebSocketUtils: utils_1.WebSocketUtils,
    EventBuilder: utils_1.EventBuilder,
};
//# sourceMappingURL=index.js.map