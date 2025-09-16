/**
 * Custom Jest Matchers - Phase 2 Testing Extensions
 * Domain-specific matchers for voice command testing
 */

import { expect } from '@jest/globals';

// Performance range matcher
expect.extend({
  toBeWithinRange(received: number, min: number, max: number) {
    const pass = received >= min && received <= max;
    
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${min} - ${max}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${min} - ${max}`,
        pass: false,
      };
    }
  },
});

// Schema validation matcher
expect.extend({
  toMatchSchema(received: any, schema: any) {
    const errors: string[] = [];
    
    // Simple schema validation
    for (const [key, rules] of Object.entries(schema)) {
      const value = received[key];
      const rule = rules as any;
      
      if (rule.required && (value === undefined || value === null)) {
        errors.push(`Missing required field: ${key}`);
        continue;
      }
      
      if (value !== undefined && value !== null) {
        if (rule.type && typeof value !== rule.type) {
          errors.push(`Field ${key} should be of type ${rule.type}, got ${typeof value}`);
        }
        
        if (rule.type === 'string' && typeof value === 'string') {
          if (rule.minLength && value.length < rule.minLength) {
            errors.push(`Field ${key} should have at least ${rule.minLength} characters`);
          }
          
          if (rule.maxLength && value.length > rule.maxLength) {
            errors.push(`Field ${key} should have at most ${rule.maxLength} characters`);
          }
          
          if (rule.pattern && !new RegExp(rule.pattern).test(value)) {
            errors.push(`Field ${key} should match pattern ${rule.pattern}`);
          }
        }
        
        if (rule.type === 'array' && Array.isArray(value)) {
          if (rule.minItems && value.length < rule.minItems) {
            errors.push(`Field ${key} should have at least ${rule.minItems} items`);
          }
          
          if (rule.maxItems && value.length > rule.maxItems) {
            errors.push(`Field ${key} should have at most ${rule.maxItems} items`);
          }
        }
        
        if (rule.enum && !rule.enum.includes(value)) {
          errors.push(`Field ${key} should be one of: ${rule.enum.join(', ')}`);
        }
      }
    }
    
    const pass = errors.length === 0;
    
    if (pass) {
      return {
        message: () => `expected object not to match schema`,
        pass: true,
      };
    } else {
      return {
        message: () => 
          `expected object to match schema, but got validation errors:\n${errors.join('\n')}`,
        pass: false,
      };
    }
  },
});

// Validation error matcher
expect.extend({
  toHaveValidationError(received: any, field: string) {
    if (!received || !received.errors || !Array.isArray(received.errors)) {
      return {
        message: () => 
          `expected object to have validation errors array, but got ${typeof received.errors}`,
        pass: false,
      };
    }
    
    const hasFieldError = received.errors.some((error: string) => 
      error.toLowerCase().includes(field.toLowerCase())
    );
    
    if (hasFieldError) {
      return {
        message: () => 
          `expected validation errors not to include field '${field}', but found: ${received.errors.join(', ')}`,
        pass: true,
      };
    } else {
      return {
        message: () => 
          `expected validation errors to include field '${field}', but got: ${received.errors.join(', ')}`,
        pass: false,
      };
    }
  },
});

// Voice command validation matcher
expect.extend({
  toBeValidVoiceCommand(received: any) {
    const errors: string[] = [];
    
    // Check required fields
    if (!received.intent || typeof received.intent !== 'string') {
      errors.push('Missing or invalid intent');
    }
    
    if (typeof received.confidence !== 'number' || received.confidence < 0 || received.confidence > 1) {
      errors.push('Invalid confidence score (should be number between 0-1)');
    }
    
    if (!Array.isArray(received.actions)) {
      errors.push('Missing or invalid actions array');
    } else {
      // Validate each action
      received.actions.forEach((action: any, index: number) => {
        if (!action.type || typeof action.type !== 'string') {
          errors.push(`Action ${index}: Missing or invalid type`);
        }
        
        if (!action.parameters || typeof action.parameters !== 'object') {
          errors.push(`Action ${index}: Missing or invalid parameters`);
        }
      });
    }
    
    if (!Array.isArray(received.entities)) {
      errors.push('Missing or invalid entities array');
    } else {
      // Validate each entity
      received.entities.forEach((entity: any, index: number) => {
        if (!entity.type || typeof entity.type !== 'string') {
          errors.push(`Entity ${index}: Missing or invalid type`);
        }
        
        if (entity.value === undefined || entity.value === null) {
          errors.push(`Entity ${index}: Missing value`);
        }
      });
    }
    
    // Check context if present
    if (received.context && typeof received.context !== 'object') {
      errors.push('Invalid context (should be object)');
    }
    
    const pass = errors.length === 0;
    
    if (pass) {
      return {
        message: () => `expected object not to be a valid voice command`,
        pass: true,
      };
    } else {
      return {
        message: () => 
          `expected object to be a valid voice command, but got validation errors:\n${errors.join('\n')}`,
        pass: false,
      };
    }
  },
});

// Performance metrics matcher
expect.extend({
  toHavePerformanceMetrics(received: any) {
    const errors: string[] = [];
    
    // Check required performance fields
    if (typeof received.responseTime !== 'number' || received.responseTime < 0) {
      errors.push('Invalid responseTime (should be positive number)');
    }
    
    if (received.processingTime !== undefined) {
      if (typeof received.processingTime !== 'number' || received.processingTime < 0) {
        errors.push('Invalid processingTime (should be positive number)');
      }
    }
    
    if (received.memoryUsage !== undefined) {
      if (typeof received.memoryUsage !== 'number' || received.memoryUsage < 0) {
        errors.push('Invalid memoryUsage (should be positive number)');
      }
    }
    
    if (received.cpuUsage !== undefined) {
      if (typeof received.cpuUsage !== 'number' || received.cpuUsage < 0 || received.cpuUsage > 100) {
        errors.push('Invalid cpuUsage (should be number between 0-100)');
      }
    }
    
    if (received.success !== undefined) {
      if (typeof received.success !== 'boolean') {
        errors.push('Invalid success flag (should be boolean)');
      }
    }
    
    // Check performance thresholds
    if (received.responseTime > 5000) {
      errors.push(`Response time ${received.responseTime}ms exceeds acceptable threshold (5000ms)`);
    }
    
    if (received.processingTime && received.processingTime > 3000) {
      errors.push(`Processing time ${received.processingTime}ms exceeds acceptable threshold (3000ms)`);
    }
    
    const pass = errors.length === 0;
    
    if (pass) {
      return {
        message: () => `expected object not to have valid performance metrics`,
        pass: true,
      };
    } else {
      return {
        message: () => 
          `expected object to have valid performance metrics, but got validation errors:\n${errors.join('\n')}`,
        pass: false,
      };
    }
  },
});

// File validation matcher
expect.extend({
  toBeValidFileMetadata(received: any) {
    const errors: string[] = [];
    
    if (!received.id || typeof received.id !== 'string') {
      errors.push('Missing or invalid file id');
    }
    
    if (!received.fileName || typeof received.fileName !== 'string') {
      errors.push('Missing or invalid fileName');
    }
    
    if (!received.originalName || typeof received.originalName !== 'string') {
      errors.push('Missing or invalid originalName');
    }
    
    if (typeof received.size !== 'number' || received.size <= 0) {
      errors.push('Invalid file size (should be positive number)');
    }
    
    if (!received.contentType || typeof received.contentType !== 'string') {
      errors.push('Missing or invalid contentType');
    }
    
    if (!received.s3Key || typeof received.s3Key !== 'string') {
      errors.push('Missing or invalid s3Key');
    }
    
    if (!received.uploadedBy || typeof received.uploadedBy !== 'string') {
      errors.push('Missing or invalid uploadedBy');
    }
    
    if (!received.organizationId || typeof received.organizationId !== 'string') {
      errors.push('Missing or invalid organizationId');
    }
    
    // Check status if present
    const validStatuses = ['pending', 'uploading', 'completed', 'failed', 'deleted'];
    if (received.status && !validStatuses.includes(received.status)) {
      errors.push(`Invalid status '${received.status}' (should be one of: ${validStatuses.join(', ')})`);
    }
    
    // Check timestamps
    if (received.uploadedAt && isNaN(Date.parse(received.uploadedAt))) {
      errors.push('Invalid uploadedAt timestamp');
    }
    
    if (received.updatedAt && isNaN(Date.parse(received.updatedAt))) {
      errors.push('Invalid updatedAt timestamp');
    }
    
    const pass = errors.length === 0;
    
    if (pass) {
      return {
        message: () => `expected object not to be valid file metadata`,
        pass: true,
      };
    } else {
      return {
        message: () => 
          `expected object to be valid file metadata, but got validation errors:\n${errors.join('\n')}`,
        pass: false,
      };
    }
  },
});

// Security event matcher
expect.extend({
  toBeValidSecurityEvent(received: any) {
    const errors: string[] = [];
    
    if (!received.eventId || typeof received.eventId !== 'string') {
      errors.push('Missing or invalid eventId');
    }
    
    const validTypes = ['authentication', 'authorization', 'rate_limit', 'validation', 'suspicious_activity'];
    if (!received.type || !validTypes.includes(received.type)) {
      errors.push(`Invalid type '${received.type}' (should be one of: ${validTypes.join(', ')})`);
    }
    
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    if (!received.severity || !validSeverities.includes(received.severity)) {
      errors.push(`Invalid severity '${received.severity}' (should be one of: ${validSeverities.join(', ')})`);
    }
    
    if (!received.action || typeof received.action !== 'string') {
      errors.push('Missing or invalid action');
    }
    
    if (!received.timestamp || isNaN(Date.parse(received.timestamp))) {
      errors.push('Missing or invalid timestamp');
    }
    
    if (received.details && typeof received.details !== 'object') {
      errors.push('Invalid details (should be object)');
    }
    
    const pass = errors.length === 0;
    
    if (pass) {
      return {
        message: () => `expected object not to be a valid security event`,
        pass: true,
      };
    } else {
      return {
        message: () => 
          `expected object to be a valid security event, but got validation errors:\n${errors.join('\n')}`,
        pass: false,
      };
    }
  },
});

// Real-time event matcher
expect.extend({
  toBeValidRealtimeEvent(received: any) {
    const errors: string[] = [];
    
    if (!received.eventType || typeof received.eventType !== 'string') {
      errors.push('Missing or invalid eventType');
    }
    
    if (!received.commandId || typeof received.commandId !== 'string') {
      errors.push('Missing or invalid commandId');
    }
    
    if (!received.userId || typeof received.userId !== 'string') {
      errors.push('Missing or invalid userId');
    }
    
    if (!received.organizationId || typeof received.organizationId !== 'string') {
      errors.push('Missing or invalid organizationId');
    }
    
    if (!received.timestamp || isNaN(Date.parse(received.timestamp))) {
      errors.push('Missing or invalid timestamp');
    }
    
    if (received.data && typeof received.data !== 'object') {
      errors.push('Invalid data (should be object)');
    }
    
    // Check event type specific requirements
    const validEventTypes = ['command_start', 'command_progress', 'command_complete', 'command_error'];
    if (!validEventTypes.includes(received.eventType)) {
      errors.push(`Invalid eventType '${received.eventType}' (should be one of: ${validEventTypes.join(', ')})`);
    }
    
    const pass = errors.length === 0;
    
    if (pass) {
      return {
        message: () => `expected object not to be a valid realtime event`,
        pass: true,
      };
    } else {
      return {
        message: () => 
          `expected object to be a valid realtime event, but got validation errors:\n${errors.join('\n')}`,
        pass: false,
      };
    }
  },
});

export {};