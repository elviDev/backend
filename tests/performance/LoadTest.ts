/**
 * Load Testing Suite - Phase 2 Performance Validation
 * Comprehensive load testing for voice command processing system
 * 
 * Test Scenarios:
 * - Concurrent voice command processing
 * - WebSocket connection scalability
 * - File upload under load
 * - Real-time broadcasting performance
 * - Cache performance under load
 */

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import { io as Client } from 'socket.io-client';

interface LoadTestConfig {
  baseUrl: string;
  websocketUrl: string;
  testDuration: number; // milliseconds
  concurrentUsers: number;
  rampUpTime: number; // milliseconds
  commandsPerUser: number;
  scenarios: LoadTestScenario[];
}

interface LoadTestScenario {
  name: string;
  weight: number; // probability of selection (0-1)
  action: (context: LoadTestContext) => Promise<LoadTestResult>;
}

interface LoadTestContext {
  userId: string;
  organizationId: string;
  socketClient?: any;
  requestNumber: number;
  startTime: number;
}

interface LoadTestResult {
  scenarioName: string;
  success: boolean;
  responseTime: number;
  errorMessage?: string;
  bytesTransferred?: number;
  additionalMetrics?: Record<string, number>;
}

interface LoadTestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  errorsPerSecond: number;
  totalBytesTransferred: number;
  concurrentUsers: number;
  testDuration: number;
  scenarioBreakdown: Record<string, {
    count: number;
    successRate: number;
    averageResponseTime: number;
  }>;
  errorBreakdown: Record<string, number>;
}

export class LoadTester extends EventEmitter {
  private config: LoadTestConfig;
  private results: LoadTestResult[] = [];
  private activeUsers: Map<string, LoadTestContext> = new Map();
  private isRunning = false;
  private startTime = 0;
  
  constructor(config: LoadTestConfig) {
    super();
    this.config = config;
  }
  
  /**
   * Execute load test with configured parameters
   */
  async runLoadTest(): Promise<LoadTestMetrics> {
    console.log('🚀 Starting load test...');
    console.log(`📊 Configuration:`, {
      concurrentUsers: this.config.concurrentUsers,
      testDuration: `${this.config.testDuration / 1000}s`,
      rampUpTime: `${this.config.rampUpTime / 1000}s`,
      commandsPerUser: this.config.commandsPerUser,
      scenarios: this.config.scenarios.length
    });
    
    this.isRunning = true;
    this.startTime = performance.now();
    this.results = [];
    this.activeUsers.clear();
    
    try {
      // Start user ramp-up
      await this.rampUpUsers();
      
      // Wait for test completion
      await this.waitForTestCompletion();
      
      // Calculate final metrics
      const metrics = this.calculateMetrics();
      
      console.log('✅ Load test completed');
      this.printMetricsSummary(metrics);
      
      return metrics;
      
    } catch (error: any) {
      console.error('❌ Load test failed:', error.message);
      throw error;
    } finally {
      this.isRunning = false;
      await this.cleanupUsers();
    }
  }
  
  /**
   * Gradually ramp up users to target concurrency
   */
  private async rampUpUsers(): Promise<void> {
    const rampUpInterval = this.config.rampUpTime / this.config.concurrentUsers;
    
    console.log(`📈 Ramping up ${this.config.concurrentUsers} users over ${this.config.rampUpTime / 1000}s`);
    
    for (let i = 0; i < this.config.concurrentUsers; i++) {
      if (!this.isRunning) break;
      
      const userId = `load-user-${i}`;
      const context = await this.createUserContext(userId);
      
      this.activeUsers.set(userId, context);
      
      // Start user's test scenario
      this.runUserScenarios(context).catch(error => {
        console.warn(`User ${userId} scenario failed:`, error.message);
      });
      
      // Wait for ramp-up interval
      if (i < this.config.concurrentUsers - 1) {
        await this.sleep(rampUpInterval);
      }
      
      // Progress indicator
      if ((i + 1) % Math.max(1, Math.floor(this.config.concurrentUsers / 10)) === 0) {
        console.log(`📊 Ramped up ${i + 1}/${this.config.concurrentUsers} users`);
      }
    }
    
    console.log('✅ All users ramped up');
  }
  
  /**
   * Create test context for a user
   */
  private async createUserContext(userId: string): Promise<LoadTestContext> {
    const organizationId = `load-org-${Math.floor(Math.random() * 10)}`; // Distribute across orgs
    
    const context: LoadTestContext = {
      userId,
      organizationId,
      requestNumber: 0,
      startTime: performance.now()
    };
    
    // Initialize WebSocket connection for real-time scenarios
    try {
      context.socketClient = Client(this.config.websocketUrl, {
        auth: { token: `test-token-${userId}` },
        timeout: 5000
      });
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
        
        context.socketClient.on('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        context.socketClient.on('connect_error', (error: any) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
    } catch (error: any) {
      console.warn(`Failed to connect socket for ${userId}:`, error.message);
    }
    
    return context;
  }
  
  /**
   * Run scenarios for a specific user
   */
  private async runUserScenarios(context: LoadTestContext): Promise<void> {
    while (this.isRunning && context.requestNumber < this.config.commandsPerUser) {
      try {
        // Select scenario based on weights
        const scenario = this.selectScenario();
        
        // Execute scenario
        const startTime = performance.now();
        const result = await scenario.action(context);
        const endTime = performance.now();
        
        // Record result
        const finalResult: LoadTestResult = {
          ...result,
          responseTime: endTime - startTime
        };
        
        this.results.push(finalResult);
        context.requestNumber++;
        
        // Emit progress event
        this.emit('result', finalResult);
        
        // Small delay between requests per user
        await this.sleep(Math.random() * 100 + 50); // 50-150ms
        
      } catch (error: any) {
        // Record error
        this.results.push({
          scenarioName: 'unknown',
          success: false,
          responseTime: 0,
          errorMessage: error.message
        });
        
        // Don't break the loop, continue with other scenarios
      }
    }
  }
  
  /**
   * Select scenario based on configured weights
   */
  private selectScenario(): LoadTestScenario {
    const random = Math.random();
    let cumulativeWeight = 0;
    
    for (const scenario of this.config.scenarios) {
      cumulativeWeight += scenario.weight;
      if (random <= cumulativeWeight) {
        return scenario;
      }
    }
    
    // Fallback to first scenario
    return this.config.scenarios[0];
  }
  
  /**
   * Wait for test completion
   */
  private async waitForTestCompletion(): Promise<void> {
    const endTime = this.startTime + this.config.testDuration;
    
    while (this.isRunning && performance.now() < endTime) {
      await this.sleep(1000);
      
      // Print progress
      const elapsed = performance.now() - this.startTime;
      const progress = Math.min(100, (elapsed / this.config.testDuration) * 100);
      const activeUsers = Array.from(this.activeUsers.values()).filter(u => u.requestNumber < this.config.commandsPerUser).length;
      
      if (Math.floor(progress) % 10 === 0) {
        console.log(`📊 Progress: ${progress.toFixed(1)}% | Active users: ${activeUsers} | Requests: ${this.results.length}`);
      }
    }
    
    this.isRunning = false;
    
    // Wait a bit for final requests to complete
    await this.sleep(2000);
  }
  
  /**
   * Calculate comprehensive test metrics
   */
  private calculateMetrics(): LoadTestMetrics {
    const successfulResults = this.results.filter(r => r.success);
    const failedResults = this.results.filter(r => !r.success);
    const responseTimes = successfulResults.map(r => r.responseTime).sort((a, b) => a - b);
    
    const totalDuration = (performance.now() - this.startTime) / 1000; // seconds
    
    // Calculate percentiles
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.50)] || 0;
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;
    
    // Calculate scenario breakdown
    const scenarioBreakdown: Record<string, any> = {};
    for (const scenario of this.config.scenarios) {
      const scenarioResults = this.results.filter(r => r.scenarioName === scenario.name);
      const scenarioSuccesses = scenarioResults.filter(r => r.success);
      
      scenarioBreakdown[scenario.name] = {
        count: scenarioResults.length,
        successRate: scenarioResults.length > 0 ? (scenarioSuccesses.length / scenarioResults.length) * 100 : 0,
        averageResponseTime: scenarioSuccesses.length > 0 
          ? scenarioSuccesses.reduce((sum, r) => sum + r.responseTime, 0) / scenarioSuccesses.length 
          : 0
      };
    }
    
    // Calculate error breakdown
    const errorBreakdown: Record<string, number> = {};
    for (const result of failedResults) {
      const errorType = result.errorMessage || 'Unknown error';
      errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
    }
    
    return {
      totalRequests: this.results.length,
      successfulRequests: successfulResults.length,
      failedRequests: failedResults.length,
      averageResponseTime: successfulResults.length > 0 
        ? successfulResults.reduce((sum, r) => sum + r.responseTime, 0) / successfulResults.length 
        : 0,
      p50ResponseTime: p50,
      p95ResponseTime: p95,
      p99ResponseTime: p99,
      minResponseTime: responseTimes[0] || 0,
      maxResponseTime: responseTimes[responseTimes.length - 1] || 0,
      requestsPerSecond: this.results.length / totalDuration,
      errorsPerSecond: failedResults.length / totalDuration,
      totalBytesTransferred: this.results.reduce((sum, r) => sum + (r.bytesTransferred || 0), 0),
      concurrentUsers: this.config.concurrentUsers,
      testDuration: totalDuration,
      scenarioBreakdown,
      errorBreakdown
    };
  }
  
  /**
   * Print metrics summary to console
   */
  private printMetricsSummary(metrics: LoadTestMetrics): void {
    console.log('\n📊 LOAD TEST RESULTS');
    console.log('=' .repeat(50));
    console.log(`📈 Total Requests: ${metrics.totalRequests}`);
    console.log(`✅ Successful: ${metrics.successfulRequests} (${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)}%)`);
    console.log(`❌ Failed: ${metrics.failedRequests} (${((metrics.failedRequests / metrics.totalRequests) * 100).toFixed(2)}%)`);
    console.log(`⏱️  Average Response Time: ${metrics.averageResponseTime.toFixed(2)}ms`);
    console.log(`📊 Response Time Percentiles:`);
    console.log(`   - P50: ${metrics.p50ResponseTime.toFixed(2)}ms`);
    console.log(`   - P95: ${metrics.p95ResponseTime.toFixed(2)}ms`);
    console.log(`   - P99: ${metrics.p99ResponseTime.toFixed(2)}ms`);
    console.log(`🚀 Throughput: ${metrics.requestsPerSecond.toFixed(2)} req/sec`);
    console.log(`👥 Concurrent Users: ${metrics.concurrentUsers}`);
    console.log(`⏰ Test Duration: ${metrics.testDuration.toFixed(2)}s`);
    console.log(`📁 Data Transferred: ${(metrics.totalBytesTransferred / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('\n🎯 SCENARIO BREAKDOWN:');
    for (const [name, stats] of Object.entries(metrics.scenarioBreakdown)) {
      console.log(`   ${name}: ${stats.count} requests, ${stats.successRate.toFixed(1)}% success, ${stats.averageResponseTime.toFixed(2)}ms avg`);
    }
    
    if (Object.keys(metrics.errorBreakdown).length > 0) {
      console.log('\n❌ ERROR BREAKDOWN:');
      for (const [error, count] of Object.entries(metrics.errorBreakdown)) {
        console.log(`   ${error}: ${count}`);
      }
    }
    
    console.log('=' .repeat(50));
  }
  
  /**
   * Cleanup user connections
   */
  private async cleanupUsers(): Promise<void> {
    console.log('🧹 Cleaning up user connections...');
    
    const cleanupPromises = Array.from(this.activeUsers.values()).map(async (context) => {
      try {
        if (context.socketClient) {
          context.socketClient.disconnect();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    
    await Promise.allSettled(cleanupPromises);
    this.activeUsers.clear();
    
    console.log('✅ Cleanup completed');
  }
  
  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default load test scenarios
export const defaultScenarios: LoadTestScenario[] = [
  {
    name: 'simple_task_creation',
    weight: 0.4,
    action: async (context: LoadTestContext): Promise<LoadTestResult> => {
      const startTime = performance.now();
      
      try {
        // Simulate voice command API call
        const response = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3001'}/api/v1/voice/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer test-token-${context.userId}`
          },
          body: JSON.stringify({
            transcription: `Create a task called "Load Test Task ${context.requestNumber}" with medium priority`,
            userId: context.userId,
            organizationId: context.organizationId
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        return {
          scenarioName: 'simple_task_creation',
          success: true,
          responseTime: performance.now() - startTime,
          bytesTransferred: JSON.stringify(data).length,
          additionalMetrics: {
            actionsCount: data.actions?.length || 0,
            confidence: data.confidence || 0
          }
        };
        
      } catch (error: any) {
        return {
          scenarioName: 'simple_task_creation',
          success: false,
          responseTime: performance.now() - startTime,
          errorMessage: error.message
        };
      }
    }
  },
  
  {
    name: 'file_upload_command',
    weight: 0.25,
    action: async (context: LoadTestContext): Promise<LoadTestResult> => {
      const startTime = performance.now();
      
      try {
        // Simulate file upload command
        const response = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3001'}/api/v1/voice/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer test-token-${context.userId}`
          },
          body: JSON.stringify({
            transcription: `Upload document load-test-${context.requestNumber}.pdf to the current project`,
            userId: context.userId,
            organizationId: context.organizationId,
            contextData: {
              currentProject: 'load-test-project',
              availableFiles: [`load-test-${context.requestNumber}.pdf`]
            }
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        return {
          scenarioName: 'file_upload_command',
          success: true,
          responseTime: performance.now() - startTime,
          bytesTransferred: JSON.stringify(data).length,
          additionalMetrics: {
            uploadUrl: data.uploadUrl ? 1 : 0,
            linkedEntities: data.linkedEntities?.length || 0
          }
        };
        
      } catch (error: any) {
        return {
          scenarioName: 'file_upload_command',
          success: false,
          responseTime: performance.now() - startTime,
          errorMessage: error.message
        };
      }
    }
  },
  
  {
    name: 'multi_action_command',
    weight: 0.2,
    action: async (context: LoadTestContext): Promise<LoadTestResult> => {
      const startTime = performance.now();
      
      try {
        // Simulate complex multi-action command
        const response = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3001'}/api/v1/voice/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer test-token-${context.userId}`
          },
          body: JSON.stringify({
            transcription: `Create a task for reviewing quarterly reports, assign it to John Doe with high priority, set due date to next Friday, and send notification to the management team`,
            userId: context.userId,
            organizationId: context.organizationId,
            contextData: {
              currentChannel: 'management',
              teamMembers: ['john.doe', 'jane.smith', 'manager.boss']
            }
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        return {
          scenarioName: 'multi_action_command',
          success: true,
          responseTime: performance.now() - startTime,
          bytesTransferred: JSON.stringify(data).length,
          additionalMetrics: {
            actionsCount: data.actions?.length || 0,
            entitiesCount: data.entities?.length || 0,
            requiresConfirmation: data.context?.requiresConfirmation ? 1 : 0
          }
        };
        
      } catch (error: any) {
        return {
          scenarioName: 'multi_action_command',
          success: false,
          responseTime: performance.now() - startTime,
          errorMessage: error.message
        };
      }
    }
  },
  
  {
    name: 'real_time_updates',
    weight: 0.15,
    action: async (context: LoadTestContext): Promise<LoadTestResult> => {
      const startTime = performance.now();
      
      if (!context.socketClient) {
        return {
          scenarioName: 'real_time_updates',
          success: false,
          responseTime: performance.now() - startTime,
          errorMessage: 'WebSocket not available'
        };
      }
      
      try {
        // Listen for real-time updates
        const updatePromise = new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Real-time update timeout')), 5000);
          
          context.socketClient.once('command_complete', (data: any) => {
            clearTimeout(timeout);
            resolve(data);
          });
          
          context.socketClient.once('error', (error: any) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
        
        // Trigger a command that should generate real-time updates
        const commandResponse = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3001'}/api/v1/voice/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer test-token-${context.userId}`
          },
          body: JSON.stringify({
            actions: [{
              type: 'create_task',
              parameters: {
                title: `Real-time task ${context.requestNumber}`,
                description: 'Task created for real-time testing'
              }
            }],
            userId: context.userId,
            organizationId: context.organizationId,
            commandId: `load-test-cmd-${context.userId}-${context.requestNumber}`
          })
        });
        
        if (!commandResponse.ok) {
          throw new Error(`HTTP ${commandResponse.status}: ${commandResponse.statusText}`);
        }
        
        // Wait for real-time update
        const updateData = await updatePromise;
        
        return {
          scenarioName: 'real_time_updates',
          success: true,
          responseTime: performance.now() - startTime,
          bytesTransferred: JSON.stringify(updateData).length,
          additionalMetrics: {
            hasUpdate: 1,
            updateLatency: updateData.timestamp ? Date.now() - new Date(updateData.timestamp).getTime() : 0
          }
        };
        
      } catch (error: any) {
        return {
          scenarioName: 'real_time_updates',
          success: false,
          responseTime: performance.now() - startTime,
          errorMessage: error.message
        };
      }
    }
  }
];

// Example usage and configuration
export const defaultLoadTestConfig: LoadTestConfig = {
  baseUrl: process.env.API_BASE_URL || 'http://localhost:3001',
  websocketUrl: process.env.WEBSOCKET_URL || 'http://localhost:3001',
  testDuration: 60000, // 1 minute
  concurrentUsers: 50,
  rampUpTime: 10000, // 10 seconds
  commandsPerUser: 20,
  scenarios: defaultScenarios
};

// CLI execution
if (require.main === module) {
  const loadTester = new LoadTester(defaultLoadTestConfig);
  
  loadTester.on('result', (result: LoadTestResult) => {
    if (!result.success) {
      console.warn(`❌ ${result.scenarioName}: ${result.errorMessage}`);
    }
  });
  
  loadTester.runLoadTest()
    .then(metrics => {
      console.log('\n✅ Load test completed successfully');
      process.exit(metrics.failedRequests > metrics.totalRequests * 0.05 ? 1 : 0); // Exit with error if >5% failure rate
    })
    .catch(error => {
      console.error('\n❌ Load test failed:', error.message);
      process.exit(1);
    });
}