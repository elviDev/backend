/**
 * Profile Picture API Routes Tests
 * Tests for profile picture upload, update, and deletion endpoints
 */

import { createTestUser } from '../setup';
import { ProfilePictureService } from '../../src/files/upload/ProfilePictureService';
import { ImageValidator } from '../../src/utils/imageValidation';

// Mock the required services
jest.mock('../../src/db/index', () => ({
  userRepository: {
    findById: jest.fn().mockResolvedValue({ id: 'test-user', name: 'Test User' }),
    update: jest.fn().mockResolvedValue({ id: 'test-user', name: 'Test User' })
  }
}));

jest.mock('../../src/files/management/FileMetadataManager', () => ({
  FileMetadataManager: jest.fn().mockImplementation(() => ({
    createFileRecord: jest.fn().mockResolvedValue({ id: 'test-file' }),
    getFileRecord: jest.fn().mockResolvedValue({ id: 'test-file', name: 'test.jpg', s3Key: 'test-key' }),
    updateFileStatus: jest.fn().mockResolvedValue(true),
    getFilesForEntity: jest.fn().mockResolvedValue([])
  }))
}));

jest.mock('../../src/files/management/S3FileManager', () => ({
  S3FileManager: jest.fn().mockImplementation(() => ({
    generatePresignedUploadUrl: jest.fn().mockResolvedValue({
      uploadUrl: 'https://test-upload-url.com',
      key: 'test-key',
      fileId: 'test-file-id',
      expiresAt: new Date(Date.now() + 900000)
    }),
    generatePresignedDownloadUrl: jest.fn().mockResolvedValue('https://test-download-url.com'),
    deleteFile: jest.fn().mockResolvedValue(true)
  }))
}));

describe('Profile Picture Service Tests', () => {
  let testUser: any;
  let profilePictureService: ProfilePictureService;

  beforeAll(() => {
    testUser = createTestUser();
    profilePictureService = new ProfilePictureService();
  });

  describe('Profile Picture Upload Initiation', () => {
    it('should initiate profile picture upload successfully', async () => {
      const uploadRequest = {
        userId: testUser.id,
        organizationId: 'test-org',
        fileName: 'profile.jpg',
        contentType: 'image/jpeg',
        fileSize: 500 * 1024, // 500KB
        description: 'My profile picture'
      };

      const result = await profilePictureService.initiateProfilePictureUpload(uploadRequest);
      
      expect(result.success).toBe(true);
      expect(result.uploadUrl).toBeDefined();
      expect(result.fileId).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should reject invalid file types', async () => {
      const uploadRequest = {
        userId: testUser.id,
        organizationId: 'test-org',
        fileName: 'document.pdf',
        contentType: 'application/pdf',
        fileSize: 100 * 1024,
      };

      const result = await profilePictureService.initiateProfilePictureUpload(uploadRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should reject files that are too large', async () => {
      const uploadRequest = {
        userId: testUser.id,
        organizationId: 'test-org',
        fileName: 'huge-image.jpg',
        contentType: 'image/jpeg',
        fileSize: 10 * 1024 * 1024, // 10MB
      };

      const result = await profilePictureService.initiateProfilePictureUpload(uploadRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });
  });

  describe('Profile Picture Completion', () => {
    it('should complete profile picture upload successfully', async () => {
      const result = await profilePictureService.completeProfilePictureUpload(
        'test-file-id',
        testUser.id,
        true
      );
      
      expect(result).toBe(true);
    });

    it('should handle failed upload completion', async () => {
      const result = await profilePictureService.completeProfilePictureUpload(
        'test-file-id',
        testUser.id,
        false,
        'Upload failed'
      );
      
      expect(result).toBe(false);
    });
  });

  describe('Profile Picture Deletion', () => {
    it('should delete profile picture successfully', async () => {
      const result = await profilePictureService.deleteProfilePicture(testUser.id);
      
      expect(result).toBe(true);
    });

  });

  describe('Profile Picture Validation', () => {
    it('should validate images correctly', () => {
      // Test valid image
      const validResult = profilePictureService.validateProfilePicture(
        'profile.jpg',
        'image/jpeg',
        500 * 1024
      );
      expect(validResult.valid).toBe(true);

      // Test invalid image (too large)
      const invalidResult = profilePictureService.validateProfilePicture(
        'huge.jpg',
        'image/jpeg',
        10 * 1024 * 1024
      );
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain('exceeds maximum');
    });

    it('should validate with buffer analysis', () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(1000).fill(0)]);
      
      const result = profilePictureService.validateProfilePictureWithBuffer(
        'test.jpg',
        'image/jpeg',
        jpegBuffer
      );
      
      expect(result.valid).toBe(true);
    });

    it('should reject invalid file extensions', () => {
      const result = profilePictureService.validateProfilePicture(
        'malware.exe',
        'image/jpeg',
        100 * 1024
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });

  describe('Image Validator Integration', () => {
    let imageValidator: ImageValidator;

    beforeAll(() => {
      imageValidator = new ImageValidator();
    });

    it('should validate image files correctly', () => {
      const result = imageValidator.validateImage(
        'test.jpg',
        'image/jpeg',
        500 * 1024
      );
      
      expect(result.valid).toBe(true);
    });

    it('should provide optimization recommendations', () => {
      const recommendations = imageValidator.getOptimalImageRecommendations(
        2 * 1024 * 1024, // 2MB
        'image/png'
      );
      
      expect(recommendations).toContain(expect.stringMatching(/compress/i));
    });

    it('should detect invalid MIME types', () => {
      const result = imageValidator.validateImage(
        'test.exe',
        'application/octet-stream',
        100 * 1024
      );
      
      expect(result.valid).toBe(false);
    });
  });

  describe('Performance Statistics', () => {
    it('should provide performance statistics', () => {
      const stats = profilePictureService.getPerformanceStats();
      
      expect(typeof stats.averageUploadTime).toBe('number');
      expect(typeof stats.totalUploads).toBe('number');
      expect(stats.averageUploadTime).toBeGreaterThanOrEqual(0);
      expect(stats.totalUploads).toBeGreaterThanOrEqual(0);
    });
  });
});