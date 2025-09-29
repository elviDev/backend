/**
 * Profile Picture Upload Service
 * Specialized service for handling user profile picture uploads with image processing
 */
import { EventEmitter } from 'events';
export interface ProfilePictureUploadRequest {
    userId: string;
    organizationId: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    description?: string;
}
export interface ProfilePictureUploadResult {
    success: boolean;
    uploadUrl?: string;
    downloadUrl?: string;
    fileId?: string;
    s3Key?: string;
    expiresAt?: Date;
    processingTime: number;
    error?: string;
}
export interface ProfilePictureValidationResult {
    valid: boolean;
    error?: string;
    recommendations?: string[];
}
export declare class ProfilePictureService extends EventEmitter {
    private s3Manager;
    private metadataManager;
    private performanceMetrics;
    private readonly MAX_IMAGE_SIZE;
    private readonly ALLOWED_IMAGE_TYPES;
    private readonly ALLOWED_MIME_TYPES;
    constructor();
    /**
     * Generate presigned URL for profile picture upload
     */
    initiateProfilePictureUpload(request: ProfilePictureUploadRequest): Promise<ProfilePictureUploadResult>;
    /**
     * Complete profile picture upload and update user record
     */
    completeProfilePictureUpload(fileId: string, userId: string, success: boolean, error?: string): Promise<boolean>;
    /**
     * Delete user's current profile picture
     */
    deleteProfilePicture(userId: string): Promise<boolean>;
    /**
     * Validate profile picture file with enhanced validation
     */
    validateProfilePicture(fileName: string, contentType: string, fileSize: number, buffer?: Buffer): ProfilePictureValidationResult;
    /**
     * Get enhanced validation with buffer analysis
     */
    validateProfilePictureWithBuffer(fileName: string, contentType: string, buffer: Buffer): ProfilePictureValidationResult;
    /**
     * Generate S3 key specifically for profile pictures
     */
    private generateProfilePictureKey;
    /**
     * Delete old profile pictures when uploading new one
     */
    private deleteOldProfilePicture;
    /**
     * Get service performance statistics
     */
    getPerformanceStats(): {
        averageUploadTime: number;
        totalUploads: number;
    };
    private recordPerformance;
}
export default ProfilePictureService;
//# sourceMappingURL=ProfilePictureService.d.ts.map