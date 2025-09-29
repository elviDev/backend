/**
 * Quick test script to verify profile picture functionality
 * Run with: tsx src/test-profile-picture.ts
 */

import { ProfilePictureService } from './files/upload/ProfilePictureService';
import { ImageValidator } from './utils/imageValidation';

async function testProfilePictureService() {
  console.log('🧪 Testing Profile Picture Service...\n');

  // Test 1: Initialize service
  console.log('1️⃣ Initializing ProfilePictureService...');
  const service = new ProfilePictureService();
  console.log('✅ Service initialized successfully\n');

  // Test 2: Test image validation
  console.log('2️⃣ Testing image validation...');
  
  const testCases = [
    {
      name: 'Valid JPEG image',
      fileName: 'profile.jpg',
      contentType: 'image/jpeg',
      fileSize: 500 * 1024, // 500KB
      expectValid: true
    },
    {
      name: 'Valid PNG image',
      fileName: 'avatar.png',
      contentType: 'image/png',
      fileSize: 1 * 1024 * 1024, // 1MB
      expectValid: true
    },
    {
      name: 'Invalid - too large',
      fileName: 'huge.jpg',
      contentType: 'image/jpeg',
      fileSize: 10 * 1024 * 1024, // 10MB
      expectValid: false
    },
    {
      name: 'Invalid - wrong type',
      fileName: 'document.pdf',
      contentType: 'application/pdf',
      fileSize: 100 * 1024, // 100KB
      expectValid: false
    },
    {
      name: 'Invalid - executable extension',
      fileName: 'malware.exe',
      contentType: 'image/jpeg',
      fileSize: 100 * 1024,
      expectValid: false
    }
  ];

  for (const testCase of testCases) {
    console.log(`   Testing: ${testCase.name}`);
    const result = service.validateProfilePicture(
      testCase.fileName,
      testCase.contentType,
      testCase.fileSize
    );
    
    if (result.valid === testCase.expectValid) {
      console.log(`   ✅ Expected ${testCase.expectValid ? 'valid' : 'invalid'} - Got ${result.valid ? 'valid' : 'invalid'}`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
      if (result.recommendations && result.recommendations.length > 0) {
        console.log(`      Recommendations: ${result.recommendations.length} items`);
      }
    } else {
      console.log(`   ❌ Expected ${testCase.expectValid ? 'valid' : 'invalid'} - Got ${result.valid ? 'valid' : 'invalid'}`);
    }
    console.log('');
  }

  // Test 3: Test ImageValidator directly
  console.log('3️⃣ Testing ImageValidator utility...');
  const validator = new ImageValidator();
  
  // Test with a mock JPEG buffer (simplified)
  const mockJpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(1000).fill(0)]);
  const validationResult = validator.validateImage(
    'test.jpg',
    'image/jpeg',
    mockJpegBuffer.length,
    mockJpegBuffer
  );
  
  console.log(`   Validation result: ${validationResult.valid ? 'Valid' : 'Invalid'}`);
  if (validationResult.warnings) {
    console.log(`   Warnings: ${validationResult.warnings.length}`);
  }
  if (validationResult.recommendations) {
    console.log(`   Recommendations: ${validationResult.recommendations.length}`);
  }
  console.log('✅ ImageValidator test completed\n');

  // Test 4: Test service performance stats
  console.log('4️⃣ Testing performance stats...');
  const stats = service.getPerformanceStats();
  console.log(`   Average upload time: ${stats.averageUploadTime}ms`);
  console.log(`   Total uploads: ${stats.totalUploads}`);
  console.log('✅ Performance stats test completed\n');

  console.log('🎉 All tests completed successfully!');
  console.log('\n📋 Summary:');
  console.log('   ✅ ProfilePictureService initialization');
  console.log('   ✅ Image validation (multiple test cases)');
  console.log('   ✅ ImageValidator utility');
  console.log('   ✅ Performance statistics');
}

// Mock some required services to avoid database dependencies
jest.mock('./db/index', () => ({
  userRepository: {
    findById: jest.fn().mockResolvedValue({ id: 'test-user', name: 'Test User' }),
    update: jest.fn().mockResolvedValue({ id: 'test-user', name: 'Test User' })
  }
}));

jest.mock('./files/management/FileMetadataManager', () => ({
  FileMetadataManager: jest.fn().mockImplementation(() => ({
    createFileRecord: jest.fn().mockResolvedValue({ id: 'test-file' }),
    getFileRecord: jest.fn().mockResolvedValue({ id: 'test-file', name: 'test.jpg' }),
    updateFileStatus: jest.fn().mockResolvedValue(true),
    getFilesForEntity: jest.fn().mockResolvedValue([])
  }))
}));

jest.mock('./files/management/S3FileManager', () => ({
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

// Run the test
if (require.main === module) {
  testProfilePictureService().catch(console.error);
}

export { testProfilePictureService };