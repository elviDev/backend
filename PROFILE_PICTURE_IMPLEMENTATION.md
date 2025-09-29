# Profile Picture Upload Implementation

## Overview

This implementation adds comprehensive profile picture upload functionality to the existing CEO communication platform. Users can now upload profile pictures both as a dedicated action and as part of their profile updates.

## Features Implemented

### 1. **Dedicated Profile Picture Service** (`src/files/upload/ProfilePictureService.ts`)
- **Upload Initiation**: Generate presigned S3 URLs for secure client-side uploads
- **Validation**: Comprehensive image validation with security checks
- **Completion Handling**: Process upload completion and update user records
- **Cleanup**: Automatic deletion of old profile pictures when new ones are uploaded
- **Performance Monitoring**: Built-in performance metrics and optimization warnings

### 2. **Enhanced Image Validation** (`src/utils/imageValidation.ts`)
- **File Type Validation**: Supports JPEG, PNG, GIF, WebP formats
- **Size Limits**: 5MB maximum for profile pictures
- **Security Checks**: File signature validation and malicious file detection
- **Optimization Recommendations**: Provides actionable feedback for image optimization
- **Buffer Analysis**: Deep validation using file content analysis

### 3. **API Endpoints** (Enhanced `src/api/routes/UserRoutes.ts`)

#### New Endpoints:
- **POST** `/users/:id/profile-picture` - Initiate profile picture upload
- **POST** `/users/:id/profile-picture/complete` - Complete upload process
- **DELETE** `/users/:id/profile-picture` - Delete profile picture

#### Enhanced Endpoints:
- **PUT** `/users/:id` - Now supports multipart form data for direct profile picture uploads

## API Documentation

### Upload Profile Picture

**Endpoint**: `POST /users/:id/profile-picture`

**Request Body**:
```json
{
  "fileName": "profile.jpg",
  "contentType": "image/jpeg", 
  "fileSize": 512000,
  "description": "My profile picture"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3-presigned-url...",
    "downloadUrl": "https://s3-download-url...",
    "fileId": "file_abc123",
    "expiresAt": "2024-01-01T15:30:00.000Z"
  },
  "timestamp": "2024-01-01T15:15:00.000Z"
}
```

### Complete Upload

**Endpoint**: `POST /users/:id/profile-picture/complete`

**Request Body**:
```json
{
  "fileId": "file_abc123",
  "success": true,
  "error": "Optional error message if success is false"
}
```

### Update Profile with Picture

**Endpoint**: `PUT /users/:id`

**Content-Type**: `multipart/form-data`

**Form Fields**:
- `name`: User name
- `department`: Department
- `profilePicture`: Image file (optional)
- Other profile fields...

## Architecture

### Service Layer
```
ProfilePictureService
├── Upload Initiation
│   ├── Validation (ImageValidator)
│   ├── S3 URL Generation (S3FileManager)
│   └── Database Record Creation (FileMetadataManager)
├── Upload Completion
│   ├── User Record Update (UserRepository)
│   ├── Old Picture Cleanup
│   └── Cache Invalidation
└── Performance Monitoring
```

### Security Features
- **File Type Restrictions**: Only image formats allowed
- **Size Limits**: 5MB maximum
- **Content Validation**: File signature verification
- **Malware Protection**: Suspicious pattern detection
- **Access Control**: Users can only upload their own pictures

### Performance Optimizations
- **Presigned URLs**: Direct client-to-S3 uploads
- **Cache Management**: Automatic cache invalidation
- **Background Cleanup**: Async old file deletion
- **Validation Caching**: Reusable validation instances

## Database Schema

### Users Table
The existing `avatar_url` field is used to store the profile picture URL:
```sql
avatar_url VARCHAR(500)  -- Stores the S3 download URL
```

### File Management
Profile pictures are tracked in the existing file management system:
- File metadata stored in `file_metadata` table
- S3 objects tagged with `profile-picture` and `avatar` tags
- Linked to users via the file management system

## Configuration

### Environment Variables
```bash
# S3 Configuration (existing)
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# File Upload Limits
MAX_PROFILE_PICTURE_SIZE=5242880  # 5MB in bytes
```

### Image Validation Settings
```typescript
const profilePictureValidator = new ImageValidator({
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxWidth: 2048,
  maxHeight: 2048,
  minWidth: 50,
  minHeight: 50,
  allowedFormats: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp']
});
```

## Usage Examples

### Frontend Integration

#### 1. Traditional Two-Step Upload
```javascript
// Step 1: Get upload URL
const response = await fetch(`/api/users/${userId}/profile-picture`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size
  })
});

const { uploadUrl, fileId } = await response.json();

// Step 2: Upload to S3
await fetch(uploadUrl, {
  method: 'PUT',
  body: file
});

// Step 3: Complete upload
await fetch(`/api/users/${userId}/profile-picture/complete`, {
  method: 'POST', 
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ fileId, success: true })
});
```

#### 2. Multipart Form Upload
```javascript
const formData = new FormData();
formData.append('name', 'John Doe');
formData.append('department', 'Engineering');
formData.append('profilePicture', file);

await fetch(`/api/users/${userId}`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});
```

## Testing

### Unit Tests (`tests/api/ProfilePictureRoutes.test.ts`)
- Upload initiation validation
- File type and size validation
- Upload completion handling
- Profile picture deletion
- Image validation utilities
- Performance statistics

### Test Coverage
- ✅ Valid image uploads
- ✅ Invalid file type rejection
- ✅ File size limit enforcement
- ✅ Security validation
- ✅ Buffer analysis
- ✅ Performance metrics
- ✅ Error handling

## Error Handling

### Validation Errors
```json
{
  "error": {
    "message": "Profile picture validation failed: File size exceeds maximum allowed size of 5MB",
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "profilePicture",
        "message": "File too large",
        "value": 10485760
      }
    ]
  }
}
```

### Recommendations System
The validator provides optimization recommendations:
```json
{
  "valid": true,
  "recommendations": [
    "Consider compressing the image for better performance",
    "WebP format provides 25-30% better compression than JPEG",
    "Recommended dimensions: 400x400px for optimal display"
  ]
}
```

## Security Considerations

1. **File Upload Security**
   - Content-type validation
   - File signature verification
   - Malicious pattern detection
   - Size and dimension limits

2. **Access Control**
   - JWT authentication required
   - Resource ownership validation
   - User can only manage their own pictures

3. **Storage Security**
   - S3 server-side encryption enabled
   - Presigned URLs with short expiration (15 minutes)
   - Secure file naming and organization

## Performance Metrics

### Target Performance
- Upload initiation: < 3 seconds
- Image validation: < 100ms  
- File cleanup: Asynchronous background processing
- Cache invalidation: < 50ms

### Monitoring
- Built-in performance tracking
- Average processing times
- Success/failure rates
- Optimization recommendations

## Future Enhancements

### Planned Features
1. **Image Processing**
   - Automatic resizing and cropping
   - Multiple size variants (thumbnail, medium, large)
   - Format optimization (WebP conversion)

2. **Advanced Validation**
   - AI-powered content moderation
   - Duplicate detection
   - Quality scoring

3. **CDN Integration**
   - CloudFront distribution
   - Global edge caching
   - Optimized delivery

4. **Batch Operations**
   - Multiple file uploads
   - Bulk user updates
   - Admin management tools

## Troubleshooting

### Common Issues

1. **Large File Uploads Failing**
   - Check multipart upload limits in Fastify config
   - Verify S3 bucket permissions
   - Ensure client timeout settings

2. **Invalid File Type Errors**
   - Verify MIME type detection
   - Check browser file type reporting
   - Validate file extensions

3. **Upload Completion Not Working**  
   - Check S3 upload success
   - Verify webhook/callback configuration
   - Review database transaction handling

### Debug Mode
Enable detailed logging:
```typescript
// Set in environment
DEBUG_PROFILE_PICTURES=true
LOG_LEVEL=debug
```

## Dependencies

### New Dependencies Added
- Enhanced validation utilities
- Buffer analysis capabilities
- Performance monitoring

### Existing Dependencies Used
- `@fastify/multipart` - File upload handling
- `@aws-sdk/client-s3` - S3 operations
- `@aws-sdk/s3-request-presigner` - Presigned URL generation
- Existing authentication and authorization middleware

## Deployment Considerations

1. **S3 Configuration**
   - Ensure bucket has proper CORS settings
   - Configure appropriate IAM permissions
   - Set up lifecycle policies for cleanup

2. **Server Configuration**
   - Adjust multipart upload limits
   - Configure request timeouts
   - Set up monitoring and alerting

3. **Database Migration**
   - No schema changes required (uses existing `avatar_url` field)
   - File metadata uses existing tables
   - Consider indexing for performance

## Conclusion

This implementation provides a robust, secure, and performant profile picture upload system that integrates seamlessly with the existing platform architecture. It supports both dedicated profile picture uploads and integrated form-based updates, with comprehensive validation, security measures, and performance optimization.