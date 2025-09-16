import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker';

const pool = new Pool({
  connectionString: config.database.url,
  min: config.database.pool.min,
  max: config.database.pool.max,
  ssl: config.app.isProduction || config.database.url.includes('rds.amazonaws.com')
    ? {
        rejectUnauthorized: false,
      }
    : false,
});

interface SeedUser {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: 'ceo' | 'manager' | 'staff';
  department: string;
  job_title: string;
  avatar_url?: string;
  phone?: string;
}

interface SeedChannel {
  id: string;
  name: string;
  description: string;
  channel_type: 'project' | 'department' | 'initiative' | 'temporary' | 'emergency' | 'announcement';
  privacy_level: 'public' | 'private' | 'restricted';
  created_by: string;
  owned_by: string;
  members: string[];
  moderators: string[];
}

interface SeedTask {
  id: string;
  title: string;
  description: string;
  channel_id: string;
  created_by: string;
  assigned_to: string[];
  owned_by: string;
  priority: 'low' | 'medium' | 'high' | 'urgent' | 'critical';
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled' | 'on_hold';
  task_type: 'general' | 'project' | 'maintenance' | 'emergency' | 'research' | 'approval';
  complexity: number;
  estimated_hours: number;
  actual_hours: number;
  progress_percentage: number;
  due_date?: Date;
  tags: string[];
}

export class DatabaseSeeder {
  private users: SeedUser[] = [];
  private channels: SeedChannel[] = [];
  private tasks: SeedTask[] = [];

  async seed(): Promise<void> {
    try {
      logger.info('Starting database seeding...');

      // Clear existing data (in reverse dependency order)
      await this.clearData();

      // Create seed data
      await this.createUsers();
      await this.createChannels();
      await this.createTasks();
      await this.createMessages();
      await this.createActivities();

      logger.info('Database seeding completed successfully');
    } catch (error) {
      logger.error('Error seeding database:', error);
      console.error('Full error details:', error);
      throw error;
    }
  }

  private async clearData(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clear in dependency order
      await client.query('DELETE FROM activities WHERE created_at > NOW() - INTERVAL \'1 day\'');
      await client.query('DELETE FROM messages WHERE created_at > NOW() - INTERVAL \'1 day\'');
      await client.query('DELETE FROM task_assignment_history WHERE performed_at > NOW() - INTERVAL \'1 day\'');
      await client.query('DELETE FROM tasks WHERE created_at > NOW() - INTERVAL \'1 day\'');
      await client.query('DELETE FROM channel_member_history WHERE performed_at > NOW() - INTERVAL \'1 day\'');
      await client.query('DELETE FROM channels WHERE created_at > NOW() - INTERVAL \'1 day\'');
      // Delete all CEO users and seed data users
      await client.query('DELETE FROM users WHERE role = \'ceo\' OR (created_at > NOW() - INTERVAL \'1 day\' AND (email LIKE \'%@seeddata.com\' OR email LIKE \'%@company.com\'))');

      await client.query('COMMIT');
      logger.info('Cleared existing seed data');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createUsers(): Promise<void> {
    const client = await pool.connect();
    
    const predefinedUsers = [
      {
        email: 'alex.ceo@company.com',
        name: 'Alexander Mitchell',
        role: 'ceo' as const,
        department: 'Executive',
        job_title: 'Chief Executive Officer',
        avatar_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=400&fit=crop&crop=face',
      },
      {
        email: 'sarah.manager@seeddata.com',
        name: 'Sarah Chen',
        role: 'manager' as const,
        department: 'Engineering',
        job_title: 'Engineering Manager',
        avatar_url: 'https://images.unsplash.com/photo-1494790108755-2616b36c7e9d?w=400&h=400&fit=crop&crop=face',
      },
      {
        email: 'mike.manager@seeddata.com',
        name: 'Michael Rodriguez',
        role: 'manager' as const,
        department: 'Product',
        job_title: 'Product Manager',
        avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=face',
      },
      {
        email: 'lisa.manager@seeddata.com',
        name: 'Lisa Thompson',
        role: 'manager' as const,
        department: 'Marketing',
        job_title: 'Marketing Director',
        avatar_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&crop=face',
      },
    ];

    const passwordHash = await bcrypt.hash('TempPass123!', 12);

    try {
      await client.query('BEGIN');

      // Create predefined users
      for (const userData of predefinedUsers) {
        const userId = faker.string.uuid();
        
        const result = await client.query(`
          INSERT INTO users (id, email, name, password_hash, role, department, job_title, avatar_url, phone, timezone, language_preference, email_verified, last_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW(), NOW())
          ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            department = EXCLUDED.department,
            job_title = EXCLUDED.job_title,
            avatar_url = EXCLUDED.avatar_url,
            phone = EXCLUDED.phone,
            timezone = EXCLUDED.timezone,
            language_preference = EXCLUDED.language_preference,
            email_verified = true,
            last_active = NOW(),
            updated_at = NOW()
          RETURNING id, email, name, role, department, job_title, avatar_url, phone, timezone, language_preference
        `, [userId, userData.email, userData.name, passwordHash, userData.role, userData.department, userData.job_title, userData.avatar_url, faker.phone.number(), 'America/New_York', 'en']);

        const createdUser = result.rows[0];
        const user: SeedUser = {
          id: createdUser.id,
          email: createdUser.email,
          name: createdUser.name,
          password_hash: passwordHash,
          role: createdUser.role,
          department: createdUser.department,
          job_title: createdUser.job_title,
          avatar_url: createdUser.avatar_url,
          phone: createdUser.phone,
        };

        this.users.push(user);
      }

      // Create additional staff members
      const departments = ['Engineering', 'Product', 'Marketing', 'Sales', 'Support', 'Finance', 'HR'];
      const jobTitles = {
        'Engineering': ['Senior Developer', 'DevOps Engineer', 'QA Engineer', 'Frontend Developer', 'Backend Developer'],
        'Product': ['Product Analyst', 'UX Designer', 'Product Owner', 'Business Analyst'],
        'Marketing': ['Content Manager', 'Social Media Manager', 'SEO Specialist', 'Brand Manager'],
        'Sales': ['Account Executive', 'Sales Representative', 'Business Development', 'Customer Success'],
        'Support': ['Technical Support', 'Customer Support', 'Documentation Specialist'],
        'Finance': ['Financial Analyst', 'Accountant', 'Controller'],
        'HR': ['HR Specialist', 'Recruiter', 'People Operations']
      };

      for (let i = 0; i < 15; i++) {
        const department = faker.helpers.arrayElement(departments);
        const jobTitle = faker.helpers.arrayElement(jobTitles[department as keyof typeof jobTitles]);
        
        const userId = faker.string.uuid();
        const email = `${faker.internet.userName().toLowerCase()}@seeddata.com`;
        const name = faker.person.fullName();
        const avatarUrl = faker.image.avatar();
        const phone = faker.phone.number();

        const timezones = ['America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Asia/Tokyo'];
        const timezone = faker.helpers.arrayElement(timezones);
        
        const result = await client.query(`
          INSERT INTO users (id, email, name, password_hash, role, department, job_title, avatar_url, phone, timezone, language_preference, email_verified, last_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW() - INTERVAL '${faker.number.int({min: 1, max: 7})} days', NOW() - INTERVAL '${faker.number.int({min: 1, max: 30})} days', NOW() - INTERVAL '${faker.number.int({min: 1, max: 15})} days')
          ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            department = EXCLUDED.department,
            job_title = EXCLUDED.job_title,
            avatar_url = EXCLUDED.avatar_url,
            phone = EXCLUDED.phone,
            timezone = EXCLUDED.timezone,
            language_preference = EXCLUDED.language_preference,
            email_verified = true,
            last_active = NOW() - INTERVAL '1 day',
            updated_at = NOW()
          RETURNING id, email, name, role, department, job_title, avatar_url, phone, timezone, language_preference
        `, [userId, email, name, passwordHash, 'staff', department, jobTitle, avatarUrl, phone, timezone, 'en']);

        const createdUser = result.rows[0];
        const user: SeedUser = {
          id: createdUser.id,
          email: createdUser.email,
          name: createdUser.name,
          password_hash: passwordHash,
          role: createdUser.role,
          department: createdUser.department,
          job_title: createdUser.job_title,
          avatar_url: createdUser.avatar_url,
          phone: createdUser.phone,
        };

        this.users.push(user);
      }

      await client.query('COMMIT');
      logger.info(`Created ${this.users.length} seed users`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createChannels(): Promise<void> {
    const client = await pool.connect();
    
    const ceo = this.users.find(u => u.role === 'ceo')!;
    const managers = this.users.filter(u => u.role === 'manager');
    const staff = this.users.filter(u => u.role === 'staff');

    const channelTemplates = [
      {
        name: 'Product Development',
        description: 'Main channel for product development discussions, roadmap planning, and feature releases',
        channel_type: 'project' as const,
        privacy_level: 'public' as const,
        created_by: ceo.id,
        owned_by: managers.find(m => m.department === 'Product')?.id || ceo.id,
        members: [ceo.id, managers.find(m => m.department === 'Product')?.id, ...managers.map(m => m.id), ...staff.filter(s => ['Engineering', 'Product'].includes(s.department)).map(s => s.id)].filter(Boolean) as string[],
        moderators: [ceo.id, managers.find(m => m.department === 'Product')?.id].filter(Boolean) as string[],
      },
      {
        name: 'Engineering Team',
        description: 'Technical discussions, architecture decisions, and development coordination',
        channel_type: 'department' as const,
        privacy_level: 'private' as const,
        created_by: managers.find(m => m.department === 'Engineering')?.id || ceo.id,
        owned_by: managers.find(m => m.department === 'Engineering')?.id || ceo.id,
        members: [ceo.id, ...staff.filter(s => s.department === 'Engineering').map(s => s.id), managers.find(m => m.department === 'Engineering')?.id].filter(Boolean) as string[],
        moderators: [managers.find(m => m.department === 'Engineering')?.id].filter(Boolean) as string[],
      },
      {
        name: 'Marketing Campaigns',
        description: 'Campaign planning, content creation, and marketing strategy discussions',
        channel_type: 'department' as const,
        privacy_level: 'public' as const,
        created_by: managers.find(m => m.department === 'Marketing')?.id || ceo.id,
        owned_by: managers.find(m => m.department === 'Marketing')?.id || ceo.id,
        members: [ceo.id, ...staff.filter(s => s.department === 'Marketing').map(s => s.id), managers.find(m => m.department === 'Marketing')?.id].filter(Boolean) as string[],
        moderators: [managers.find(m => m.department === 'Marketing')?.id].filter(Boolean) as string[],
      },
      {
        name: 'Executive Announcements',
        description: 'Important company-wide announcements and strategic updates from leadership',
        channel_type: 'announcement' as const,
        privacy_level: 'public' as const,
        created_by: ceo.id,
        owned_by: ceo.id,
        members: this.users.map(u => u.id),
        moderators: [ceo.id, ...managers.map(m => m.id)],
      },
      {
        name: 'Q4 2024 Launch',
        description: 'Coordination for the major Q4 product launch - cross-functional collaboration',
        channel_type: 'initiative' as const,
        privacy_level: 'restricted' as const,
        created_by: ceo.id,
        owned_by: managers.find(m => m.department === 'Product')?.id || ceo.id,
        members: [ceo.id, managers.find(m => m.department === 'Product')?.id, ...managers.map(m => m.id), ...staff.filter(s => ['Engineering', 'Product', 'Marketing'].includes(s.department)).slice(0, 8).map(s => s.id)].filter(Boolean) as string[],
        moderators: [ceo.id, managers.find(m => m.department === 'Product')?.id].filter(Boolean) as string[],
      },
      {
        name: 'Mobile App Beta',
        description: 'Beta testing coordination and feedback collection for the new mobile application',
        channel_type: 'project' as const,
        privacy_level: 'private' as const,
        created_by: managers.find(m => m.department === 'Product')?.id || ceo.id,
        owned_by: managers.find(m => m.department === 'Product')?.id || ceo.id,
        members: [ceo.id, managers.find(m => m.department === 'Product')?.id, ...staff.filter(s => ['Engineering', 'Product', 'Support'].includes(s.department)).slice(0, 6).map(s => s.id)].filter(Boolean) as string[],
        moderators: [managers.find(m => m.department === 'Product')?.id].filter(Boolean) as string[],
      },
    ];

    try {
      await client.query('BEGIN');

      for (const channelData of channelTemplates) {
        const channelId = faker.string.uuid();
        const channel: SeedChannel = {
          id: channelId,
          ...channelData,
        };

        await client.query(`
          INSERT INTO channels (id, name, description, channel_type, privacy_level, created_by, owned_by, members, moderators, member_count, created_at, last_activity_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() - INTERVAL '${faker.number.int({min: 5, max: 25})} days', NOW() - INTERVAL '${faker.number.int({min: 1, max: 8})} hours')
        `, [
          channel.id,
          channel.name,
          channel.description,
          channel.channel_type,
          channel.privacy_level,
          channel.created_by,
          channel.owned_by,
          channel.members,
          channel.moderators,
          channel.members.length,
        ]);

        this.channels.push(channel);
      }

      await client.query('COMMIT');
      logger.info(`Created ${this.channels.length} seed channels`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createTasks(): Promise<void> {
    const client = await pool.connect();
    
    const taskTemplates = [
      {
        title: 'Implement Two-Factor Authentication',
        description: 'Add 2FA support for all user accounts to enhance security. Include SMS, email, and authenticator app options.',
        priority: 'high' as const,
        status: 'in_progress' as const,
        task_type: 'project' as const,
        complexity: 7,
        estimated_hours: 40,
        actual_hours: 28,
        progress_percentage: 70,
        tags: ['security', 'authentication', 'mobile'],
      },
      {
        title: 'Fix Payment Processing Bug',
        description: 'Critical bug in payment processing causing failed transactions for amounts over $1000. Customer complaints increasing.',
        priority: 'critical' as const,
        status: 'pending' as const,
        task_type: 'emergency' as const,
        complexity: 8,
        estimated_hours: 16,
        actual_hours: 0,
        progress_percentage: 0,
        tags: ['bug', 'payments', 'critical'],
      },
      {
        title: 'Mobile App Performance Optimization',
        description: 'Optimize mobile app loading times and reduce memory usage. Target 50% improvement in startup time.',
        priority: 'medium' as const,
        status: 'review' as const,
        task_type: 'maintenance' as const,
        complexity: 6,
        estimated_hours: 32,
        actual_hours: 35,
        progress_percentage: 95,
        tags: ['mobile', 'performance', 'optimization'],
      },
      {
        title: 'Q4 Marketing Campaign Planning',
        description: 'Develop comprehensive marketing strategy for Q4 launch including social media, content marketing, and paid advertising.',
        priority: 'high' as const,
        status: 'in_progress' as const,
        task_type: 'project' as const,
        complexity: 5,
        estimated_hours: 60,
        actual_hours: 22,
        progress_percentage: 40,
        tags: ['marketing', 'campaign', 'q4-launch'],
      },
      {
        title: 'Database Migration to PostgreSQL 15',
        description: 'Upgrade database to PostgreSQL 15 for better performance and new features. Plan for zero-downtime migration.',
        priority: 'medium' as const,
        status: 'pending' as const,
        task_type: 'maintenance' as const,
        complexity: 9,
        estimated_hours: 48,
        actual_hours: 0,
        progress_percentage: 0,
        tags: ['database', 'migration', 'infrastructure'],
      },
      {
        title: 'Customer Support Dashboard',
        description: 'Build new dashboard for customer support team with ticket analytics, response time tracking, and customer satisfaction metrics.',
        priority: 'medium' as const,
        status: 'in_progress' as const,
        task_type: 'project' as const,
        complexity: 6,
        estimated_hours: 45,
        actual_hours: 18,
        progress_percentage: 35,
        tags: ['dashboard', 'support', 'analytics'],
      },
      {
        title: 'API Rate Limiting Implementation',
        description: 'Implement rate limiting across all API endpoints to prevent abuse and ensure fair usage.',
        priority: 'high' as const,
        status: 'completed' as const,
        task_type: 'project' as const,
        complexity: 4,
        estimated_hours: 24,
        actual_hours: 26,
        progress_percentage: 100,
        tags: ['api', 'security', 'rate-limiting'],
      },
      {
        title: 'User Onboarding Flow Redesign',
        description: 'Redesign user onboarding to improve conversion rates and reduce drop-off. A/B testing required.',
        priority: 'high' as const,
        status: 'review' as const,
        task_type: 'project' as const,
        complexity: 7,
        estimated_hours: 55,
        actual_hours: 52,
        progress_percentage: 90,
        tags: ['ux', 'onboarding', 'conversion'],
      },
      {
        title: 'Automated Testing Suite Expansion',
        description: 'Expand automated testing coverage to 90% for all critical user flows and API endpoints.',
        priority: 'medium' as const,
        status: 'in_progress' as const,
        task_type: 'maintenance' as const,
        complexity: 8,
        estimated_hours: 38,
        actual_hours: 15,
        progress_percentage: 25,
        tags: ['testing', 'automation', 'quality'],
      },
      {
        title: 'GDPR Compliance Audit',
        description: 'Complete GDPR compliance audit and implement necessary changes for European data protection requirements.',
        priority: 'urgent' as const,
        status: 'on_hold' as const,
        task_type: 'approval' as const,
        complexity: 5,
        estimated_hours: 30,
        actual_hours: 8,
        progress_percentage: 15,
        tags: ['gdpr', 'compliance', 'legal'],
      },
    ];

    try {
      await client.query('BEGIN');

      for (let i = 0; i < taskTemplates.length; i++) {
        const template = taskTemplates[i]!;
        const channel = faker.helpers.arrayElement(this.channels);
        const creator = faker.helpers.arrayElement(channel.members);
        const assignees = faker.helpers.arrayElements(channel.members, { min: 1, max: 3 });
        const owner = assignees[0]!;

        const taskId = faker.string.uuid();
        const task: SeedTask = {
          id: taskId,
          title: template.title,
          description: template.description,
          channel_id: channel.id,
          created_by: creator,
          assigned_to: assignees,
          owned_by: owner,
          priority: template.priority,
          status: template.status,
          task_type: template.task_type,
          complexity: template.complexity,
          estimated_hours: template.estimated_hours,
          actual_hours: template.actual_hours,
          progress_percentage: template.progress_percentage,
          tags: template.tags,
          due_date: faker.date.future({ days: faker.number.int({ min: 7, max: 60 }) }),
        };

        await client.query(`
          INSERT INTO tasks (
            id, title, description, channel_id, created_by, assigned_to, owned_by,
            priority, status, task_type, complexity, estimated_hours, actual_hours,
            progress_percentage, due_date, tags, created_at, last_activity_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 
                  NOW() - INTERVAL '${faker.number.int({min: 1, max: 15})} days',
                  NOW() - INTERVAL '${faker.number.int({min: 1, max: 24})} hours')
        `, [
          task.id, task.title, task.description, task.channel_id, task.created_by,
          task.assigned_to, task.owned_by, task.priority, task.status, task.task_type,
          task.complexity, task.estimated_hours, task.actual_hours, task.progress_percentage,
          task.due_date, task.tags
        ]);

        this.tasks.push(task);
      }

      // Create additional random tasks
      for (let i = 0; i < 15; i++) {
        const channel = faker.helpers.arrayElement(this.channels);
        const creator = faker.helpers.arrayElement(channel.members);
        const assignees = faker.helpers.arrayElements(channel.members, { min: 1, max: 2 });
        const owner = assignees[0]!;

        const taskId = faker.string.uuid();
        const priorities = ['low', 'medium', 'high', 'urgent'] as const;
        const statuses = ['pending', 'in_progress', 'review', 'completed', 'on_hold'] as const;
        const types = ['general', 'project', 'maintenance', 'research'] as const;
        const tags = ['frontend', 'backend', 'mobile', 'api', 'ui/ux', 'security', 'performance', 'testing', 'documentation'];

        const task: SeedTask = {
          id: taskId,
          title: faker.company.catchPhrase(),
          description: faker.lorem.sentences(3),
          channel_id: channel.id,
          created_by: creator,
          assigned_to: assignees,
          owned_by: owner,
          priority: faker.helpers.arrayElement(priorities),
          status: faker.helpers.arrayElement(statuses),
          task_type: faker.helpers.arrayElement(types),
          complexity: faker.number.int({ min: 1, max: 10 }),
          estimated_hours: faker.number.int({ min: 4, max: 80 }),
          actual_hours: faker.number.int({ min: 0, max: 60 }),
          progress_percentage: faker.number.int({ min: 0, max: 100 }),
          tags: faker.helpers.arrayElements(tags, { min: 1, max: 3 }),
          due_date: faker.helpers.maybe(() => faker.date.future({ days: faker.number.int({ min: 3, max: 90 }) }), { probability: 0.7 }),
        };

        await client.query(`
          INSERT INTO tasks (
            id, title, description, channel_id, created_by, assigned_to, owned_by,
            priority, status, task_type, complexity, estimated_hours, actual_hours,
            progress_percentage, due_date, tags, created_at, last_activity_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 
                  NOW() - INTERVAL '${faker.number.int({min: 1, max: 20})} days',
                  NOW() - INTERVAL '${faker.number.int({min: 1, max: 48})} hours')
        `, [
          task.id, task.title, task.description, task.channel_id, task.created_by,
          task.assigned_to, task.owned_by, task.priority, task.status, task.task_type,
          task.complexity, task.estimated_hours, task.actual_hours, task.progress_percentage,
          task.due_date, task.tags
        ]);

        this.tasks.push(task);
      }

      await client.query('COMMIT');
      logger.info(`Created ${this.tasks.length} seed tasks`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createMessages(): Promise<void> {
    const client = await pool.connect();

    const messageTypes = ['text', 'file', 'voice', 'system'] as const;
    const systemMessages = [
      'Channel created',
      'User joined the channel',
      'Task created and assigned',
      'Task status updated',
      'File uploaded',
      'Meeting scheduled',
    ];

    try {
      await client.query('BEGIN');

      for (const channel of this.channels) {
        const messageCount = faker.number.int({ min: 10, max: 40 });
        
        for (let i = 0; i < messageCount; i++) {
          const messageType = faker.helpers.arrayElement(messageTypes);
          const sender = messageType === 'system' 
            ? this.users.find(u => u.role === 'ceo')?.id || faker.helpers.arrayElement(channel.members)
            : faker.helpers.arrayElement(channel.members);
          const messageId = faker.string.uuid();
          
          let content = '';
          let metadata = {};

          switch (messageType) {
            case 'text':
              content = faker.lorem.sentences(faker.number.int({ min: 1, max: 4 }));
              break;
            case 'file':
              content = 'File shared: ' + faker.system.fileName();
              metadata = {
                fileName: faker.system.fileName(),
                fileSize: faker.number.int({ min: 1000, max: 5000000 }),
                fileType: faker.helpers.arrayElement(['image/png', 'application/pdf', 'text/csv']),
              };
              break;
            case 'voice':
              content = 'Voice message (transcription): ' + faker.lorem.sentences(2);
              metadata = {
                duration: faker.number.int({ min: 5, max: 120 }),
                transcription: faker.lorem.sentences(2),
              };
              break;
            case 'system':
              content = faker.helpers.arrayElement(systemMessages);
              break;
          }

          await client.query(`
            INSERT INTO messages (id, channel_id, user_id, content, message_type, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '${faker.number.int({min: 1, max: 30})} days' + INTERVAL '${faker.number.int({min: 0, max: 23})} hours' + INTERVAL '${faker.number.int({min: 0, max: 59})} minutes')
          `, [messageId, channel.id, sender, content, messageType, JSON.stringify(metadata)]);
        }
      }

      await client.query('COMMIT');
      logger.info('Created seed messages for all channels');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createActivities(): Promise<void> {
    const client = await pool.connect();

    const activityTypes = ['task_created', 'task_updated', 'task_completed', 'channel_created', 'user_joined', 'file_uploaded', 'message_sent', 'announcement'] as const;
    
    try {
      await client.query('BEGIN');

      // Create activities for tasks
      for (const task of this.tasks) {
        // Task creation activity
        const createActivityId = faker.string.uuid();
        await client.query(`
          INSERT INTO activities (id, user_id, activity_type, title, description, metadata, referenced_entity_id, channel_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '${faker.number.int({min: 1, max: 15})} days')
        `, [
          createActivityId,
          task.created_by,
          'task_created',
          `Created task: ${task.title}`,
          `A new ${task.priority} priority task was created in ${this.channels.find(c => c.id === task.channel_id)?.name}`,
          JSON.stringify({
            task_id: task.id,
            priority: task.priority,
            assigned_to: task.assigned_to,
          }),
          task.id,
          task.channel_id,
        ]);

        // Random task updates
        if (task.status !== 'pending' && faker.datatype.boolean(0.7)) {
          const updateActivityId = faker.string.uuid();
          await client.query(`
            INSERT INTO activities (id, user_id, activity_type, title, description, metadata, referenced_entity_id, channel_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '${faker.number.int({min: 1, max: 10})} days')
          `, [
            updateActivityId,
            task.owned_by,
            'task_updated',
            `Updated task: ${task.title}`,
            `Task status changed to ${task.status}. Progress: ${task.progress_percentage}%`,
            JSON.stringify({
              task_id: task.id,
              status: task.status,
              progress: task.progress_percentage,
            }),
            task.id,
            task.channel_id,
          ]);
        }

        // Task completion activities
        if (task.status === 'completed') {
          const completeActivityId = faker.string.uuid();
          await client.query(`
            INSERT INTO activities (id, user_id, activity_type, title, description, metadata, referenced_entity_id, channel_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '${faker.number.int({min: 1, max: 7})} days')
          `, [
            completeActivityId,
            task.owned_by,
            'task_completed',
            `Completed task: ${task.title}`,
            `Task was successfully completed ahead of schedule`,
            JSON.stringify({
              task_id: task.id,
              completion_time: task.actual_hours,
              estimated_time: task.estimated_hours,
            }),
            task.id,
            task.channel_id,
          ]);
        }
      }

      // Create channel activities
      for (const channel of this.channels) {
        const createActivityId = faker.string.uuid();
        await client.query(`
          INSERT INTO activities (id, user_id, activity_type, title, description, metadata, referenced_entity_id, channel_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '${faker.number.int({min: 5, max: 25})} days')
        `, [
          createActivityId,
          channel.created_by,
          'channel_created',
          `Created channel: ${channel.name}`,
          `New ${channel.channel_type} channel created for ${channel.description}`,
          JSON.stringify({
            channel_id: channel.id,
            channel_type: channel.channel_type,
            privacy_level: channel.privacy_level,
          }),
          channel.id,
          channel.id,
        ]);
      }

      // Create general announcements
      const announcements = [
        {
          title: 'Q4 All-Hands Meeting Scheduled',
          description: 'Join us for the quarterly all-hands meeting next Friday at 2 PM. We\'ll be discussing Q3 results, Q4 goals, and exciting new product launches.',
          metadata: { type: 'meeting', importance: 'high', attendees: 'all' },
        },
        {
          title: 'New Security Policy Implementation',
          description: 'Starting next week, all team members must enable two-factor authentication on their accounts. IT support is available for setup assistance.',
          metadata: { type: 'policy', importance: 'high', deadline: '2024-01-15' },
        },
        {
          title: 'Office Holiday Party',
          description: 'You\'re invited to our annual holiday celebration! Join us for food, drinks, and team building activities on December 15th.',
          metadata: { type: 'event', importance: 'medium', location: 'Main Office' },
        },
        {
          title: 'System Maintenance Window',
          description: 'Scheduled maintenance on our main servers will occur this Sunday from 2 AM to 6 AM. Some services may be temporarily unavailable.',
          metadata: { type: 'maintenance', importance: 'medium', duration: '4 hours' },
        },
      ];

      for (const announcement of announcements) {
        const announcementId = faker.string.uuid();
        const announcer = this.users.find(u => u.role === 'ceo')?.id || faker.helpers.arrayElement(this.users.filter(u => u.role === 'manager')).id;
        
        await client.query(`
          INSERT INTO activities (id, user_id, activity_type, title, description, metadata, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '${faker.number.int({min: 1, max: 14})} days')
        `, [
          announcementId,
          announcer,
          'ai_response',
          announcement.title,
          announcement.description,
          JSON.stringify(announcement.metadata),
        ]);
      }

      await client.query('COMMIT');
      logger.info('Created comprehensive seed activities');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// Self-executing function when run directly
async function runSeeder() {
  const seeder = new DatabaseSeeder();
  try {
    await seeder.seed();
    process.exit(0);
  } catch (error) {
    logger.error('Seeding failed:', error);
    console.error('Full seeding error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runSeeder();
}

export default DatabaseSeeder;