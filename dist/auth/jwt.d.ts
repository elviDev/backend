/**
 * JWT Authentication system with refresh token support
 * Enterprise-grade security with proper token management
 */
export interface TokenPayload {
    userId: string;
    email: string;
    role: 'ceo' | 'manager' | 'staff';
    name: string;
    permissions: string[];
    sessionId: string;
    type: 'access' | 'refresh';
    iat: number;
    exp: number;
}
export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
}
export interface AccessTokenData {
    token: string;
    payload: TokenPayload;
    expiresAt: Date;
}
/**
 * Role-based permissions mapping
 */
declare const ROLE_PERMISSIONS: Record<string, string[]>;
/**
 * JWT service class
 */
declare class JWTService {
    private readonly accessTokenSecret;
    private readonly refreshTokenSecret;
    private readonly accessTokenExpiry;
    private readonly refreshTokenExpiry;
    constructor();
    /**
     * Generate access and refresh token pair
     */
    generateTokens(user: {
        id: string;
        email: string;
        role: 'ceo' | 'manager' | 'staff';
        name: string;
    }): Promise<TokenPair>;
    /**
     * Verify and decode access token
     */
    verifyAccessToken(token: string): Promise<TokenPayload>;
    /**
     * Verify and decode refresh token
     */
    verifyRefreshToken(token: string): Promise<TokenPayload>;
    /**
     * Refresh access token using refresh token
     */
    refreshTokens(refreshToken: string): Promise<TokenPair>;
    /**
     * Decode token without verification (for debugging)
     */
    decodeToken(token: string): TokenPayload | null;
    /**
     * Extract token from Authorization header
     */
    extractTokenFromHeader(authHeader: string | undefined): string | null;
    /**
     * Check if user has required permission
     */
    hasPermission(payload: TokenPayload, requiredPermission: string): boolean;
    /**
     * Check if user has any of the required permissions
     */
    hasAnyPermission(payload: TokenPayload, requiredPermissions: string[]): boolean;
    /**
     * Check if user has all required permissions
     */
    hasAllPermissions(payload: TokenPayload, requiredPermissions: string[]): boolean;
    /**
     * Get token expiration date
     */
    getTokenExpiration(token: string): Date | null;
    /**
     * Check if token is expired
     */
    isTokenExpired(token: string): boolean;
    /**
     * Generate password reset token (separate from auth tokens)
     */
    generatePasswordResetToken(userId: string): string;
    /**
     * Verify password reset token
     */
    verifyPasswordResetToken(token: string, userId: string): boolean;
    /**
     * Generate email verification token
     */
    generateEmailVerificationToken(userId: string, email: string): string;
    /**
     * Verify email verification token
     */
    verifyEmailVerificationToken(token: string, email: string): {
        userId: string;
    } | null;
}
export declare const jwtService: JWTService;
export default jwtService;
export declare const PERMISSIONS: {
    readonly CHANNELS_CREATE: "channels:create";
    readonly CHANNELS_READ: "channels:read";
    readonly CHANNELS_UPDATE: "channels:update";
    readonly CHANNELS_DELETE: "channels:delete";
    readonly CHANNELS_MANAGE_MEMBERS: "channels:manage_members";
    readonly CHANNELS_ARCHIVE: "channels:archive";
    readonly TASKS_CREATE: "tasks:create";
    readonly TASKS_READ: "tasks:read";
    readonly TASKS_UPDATE: "tasks:update";
    readonly TASKS_DELETE: "tasks:delete";
    readonly TASKS_ASSIGN: "tasks:assign";
    readonly TASKS_MANAGE_DEPENDENCIES: "tasks:manage_dependencies";
    readonly USERS_CREATE: "users:create";
    readonly USERS_READ: "users:read";
    readonly USERS_UPDATE: "users:update";
    readonly USERS_DELETE: "users:delete";
    readonly USERS_MANAGE_ROLES: "users:manage_roles";
    readonly VOICE_COMMANDS: "voice:commands";
    readonly VOICE_TRANSCRIBE: "voice:transcribe";
    readonly VOICE_PROCESS: "voice:process";
    readonly SYSTEM_ADMIN: "system:admin";
    readonly ANALYTICS_READ: "analytics:read";
};
export { ROLE_PERMISSIONS };
//# sourceMappingURL=jwt.d.ts.map