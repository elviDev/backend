import jwt from 'jsonwebtoken';
import { config } from '@config/index';
import { logger, securityLogger } from '@utils/logger';
import { AuthenticationError, TokenExpiredError, InvalidTokenError } from '@utils/errors';
import crypto from 'crypto';

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
const ROLE_PERMISSIONS: Record<string, string[]> = {
  ceo: [
    // Wildcard permission - CEO has access to everything
    '*'
  ],
  manager: [
    // Channel management within scope
    'channels:create', 'channels:read', 'channels:update',
    'channels:manage_members',
    // Task management
    'tasks:create', 'tasks:read', 'tasks:update',
    'tasks:assign', 'tasks:manage_dependencies',
    // Limited user management
    'users:read', 'users:update_profile',
    // Voice features (limited)
    'voice:commands',
    // Analytics (read-only)
    'analytics:read'
  ],
  staff: [
    // Basic channel access
    'channels:read', 'channels:participate',
    // Task participation
    'tasks:read', 'tasks:update_own', 'tasks:comment',
    // Profile management
    'users:read_own', 'users:update_own_profile',
    // No voice commands (CEO-only feature)
  ]
};

/**
 * Generate cryptographically secure session ID
 */
const generateSessionId = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Convert time string to seconds
 */
const parseTimeToSeconds = (timeStr: string): number => {
  const unit = timeStr.slice(-1);
  const value = parseInt(timeStr.slice(0, -1));
  
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return value;
  }
};

/**
 * JWT service class
 */
class JWTService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor() {
    this.accessTokenSecret = config.jwt.secret;
    this.refreshTokenSecret = config.jwt.refreshSecret;
    this.accessTokenExpiry = config.jwt.expiresIn;
    this.refreshTokenExpiry = config.jwt.refreshExpiresIn;
  }

  /**
   * Generate access and refresh token pair
   */
  async generateTokens(user: {
    id: string;
    email: string;
    role: 'ceo' | 'manager' | 'staff';
    name: string;
  }): Promise<TokenPair> {
    const sessionId = generateSessionId();
    const permissions = ROLE_PERMISSIONS[user.role] || [];

    const basePayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      permissions,
      sessionId
    };

    // Generate access token
    const accessToken = jwt.sign(
      { ...basePayload, type: 'access' },
      this.accessTokenSecret,
      {
        expiresIn: this.accessTokenExpiry,
        issuer: 'ceo-platform',
        audience: 'ceo-platform-api',
        subject: user.id
      } as jwt.SignOptions
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { ...basePayload, type: 'refresh' },
      this.refreshTokenSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'ceo-platform',
        audience: 'ceo-platform-api',
        subject: user.id
      } as jwt.SignOptions
    );

    const expiresIn = parseTimeToSeconds(this.accessTokenExpiry);
    const refreshExpiresIn = parseTimeToSeconds(this.refreshTokenExpiry);

    securityLogger.logAuthEvent('token_generated', {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      expiresIn,
      refreshExpiresIn
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      refreshExpiresIn
    };
  }

  /**
   * Verify and decode access token
   */
  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const payload = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'ceo-platform',
        audience: 'ceo-platform-api'
      }) as TokenPayload;

      if (payload.type !== 'access') {
        throw new InvalidTokenError('Token type mismatch - expected access token');
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredError('Access token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new InvalidTokenError(`Invalid access token: ${error.message}`);
      } else {
        logger.error({ error }, 'Unexpected error verifying access token');
        throw new AuthenticationError('Token verification failed');
      }
    }
  }

  /**
   * Verify and decode refresh token
   */
  async verifyRefreshToken(token: string): Promise<TokenPayload> {
    try {
      const payload = jwt.verify(token, this.refreshTokenSecret, {
        issuer: 'ceo-platform',
        audience: 'ceo-platform-api'
      }) as TokenPayload;

      if (payload.type !== 'refresh') {
        throw new InvalidTokenError('Token type mismatch - expected refresh token');
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        securityLogger.logAuthEvent('refresh_token_expired', {
          error: error.message
        });
        throw new TokenExpiredError('Refresh token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        securityLogger.logSecurityViolation('invalid_refresh_token', {
          error: error.message,
          token: token.substring(0, 20) + '...'
        });
        throw new InvalidTokenError(`Invalid refresh token: ${error.message}`);
      } else {
        logger.error({ error }, 'Unexpected error verifying refresh token');
        throw new AuthenticationError('Refresh token verification failed');
      }
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyRefreshToken(refreshToken);
    
    // Generate new token pair with same user data
    const user = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
      name: payload.name
    };

    const newTokens = await this.generateTokens(user);

    securityLogger.logAuthEvent('token_refreshed', {
      userId: payload.userId,
      email: payload.email,
      oldSessionId: payload.sessionId,
      newSessionId: 'generated' // New session ID is in the new tokens
    });

    return newTokens;
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): TokenPayload | null {
    try {
      const payload = jwt.decode(token) as TokenPayload;
      return payload;
    } catch (error) {
      logger.warn({ error }, 'Failed to decode token');
      return null;
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || typeof authHeader !== 'string') {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1] || null;
  }

  /**
   * Check if user has required permission
   */
  hasPermission(payload: TokenPayload, requiredPermission: string): boolean {
    // Check for wildcard permission first (CEO has all permissions)
    if (payload.permissions.includes('*')) {
      return true;
    }
    return payload.permissions.includes(requiredPermission);
  }

  /**
   * Check if user has any of the required permissions
   */
  hasAnyPermission(payload: TokenPayload, requiredPermissions: string[]): boolean {
    // Check for wildcard permission first (CEO has all permissions)
    if (payload.permissions.includes('*')) {
      return true;
    }
    return requiredPermissions.some(permission => 
      payload.permissions.includes(permission)
    );
  }

  /**
   * Check if user has all required permissions
   */
  hasAllPermissions(payload: TokenPayload, requiredPermissions: string[]): boolean {
    // Check for wildcard permission first (CEO has all permissions)
    if (payload.permissions.includes('*')) {
      return true;
    }
    return requiredPermissions.every(permission => 
      payload.permissions.includes(permission)
    );
  }

  /**
   * Get token expiration date
   */
  getTokenExpiration(token: string): Date | null {
    const payload = this.decodeToken(token);
    if (!payload || !payload.exp) {
      return null;
    }
    
    return new Date(payload.exp * 1000);
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) {
      return true;
    }
    
    return expiration.getTime() < Date.now();
  }

  /**
   * Generate password reset token (separate from auth tokens)
   */
  generatePasswordResetToken(userId: string): string {
    return jwt.sign(
      { userId, type: 'password_reset' },
      this.accessTokenSecret + userId, // Include user ID in secret for security
      { expiresIn: '1h' }
    );
  }

  /**
   * Verify password reset token
   */
  verifyPasswordResetToken(token: string, userId: string): boolean {
    try {
      const payload = jwt.verify(
        token, 
        this.accessTokenSecret + userId
      ) as any;
      
      return payload.userId === userId && payload.type === 'password_reset';
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate email verification token
   */
  generateEmailVerificationToken(userId: string, email: string): string {
    return jwt.sign(
      { userId, email, type: 'email_verification' },
      this.accessTokenSecret + email,
      { expiresIn: '24h' }
    );
  }

  /**
   * Verify email verification token
   */
  verifyEmailVerificationToken(token: string, email: string): { userId: string } | null {
    try {
      const payload = jwt.verify(
        token,
        this.accessTokenSecret + email
      ) as any;
      
      if (payload.email === email && payload.type === 'email_verification') {
        return { userId: payload.userId };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }
}

// Export singleton instance
export const jwtService = new JWTService();
export default jwtService;

// Export permission constants
export const PERMISSIONS = {
  // Channel permissions
  CHANNELS_CREATE: 'channels:create',
  CHANNELS_READ: 'channels:read',
  CHANNELS_UPDATE: 'channels:update',
  CHANNELS_DELETE: 'channels:delete',
  CHANNELS_MANAGE_MEMBERS: 'channels:manage_members',
  CHANNELS_ARCHIVE: 'channels:archive',
  
  // Task permissions
  TASKS_CREATE: 'tasks:create',
  TASKS_READ: 'tasks:read',
  TASKS_UPDATE: 'tasks:update',
  TASKS_DELETE: 'tasks:delete',
  TASKS_ASSIGN: 'tasks:assign',
  TASKS_MANAGE_DEPENDENCIES: 'tasks:manage_dependencies',
  
  // User permissions
  USERS_CREATE: 'users:create',
  USERS_READ: 'users:read',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  USERS_MANAGE_ROLES: 'users:manage_roles',
  
  // Voice permissions
  VOICE_COMMANDS: 'voice:commands',
  VOICE_TRANSCRIBE: 'voice:transcribe',
  VOICE_PROCESS: 'voice:process',
  
  // System permissions
  SYSTEM_ADMIN: 'system:admin',
  ANALYTICS_READ: 'analytics:read',
} as const;

export { ROLE_PERMISSIONS };