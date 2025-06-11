import { supabase } from './supabase';
import { videoTracker } from './videoTracker';

export interface VideoDownloadProgress {
  videoId: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number; // bytes per second
  estimatedTimeRemaining: number; // seconds
}

export interface VideoStorageResult {
  success: boolean;
  publicUrl?: string;
  storagePath?: string;
  fileSize?: number;
  error?: string;
  integrityVerified?: boolean;
}

export class EnhancedVideoStorage {
  private static instance: EnhancedVideoStorage;
  private downloadProgressCallbacks: Map<string, (progress: VideoDownloadProgress) => void> = new Map();

  private constructor() {}

  static getInstance(): EnhancedVideoStorage {
    if (!EnhancedVideoStorage.instance) {
      EnhancedVideoStorage.instance = new EnhancedVideoStorage();
    }
    return EnhancedVideoStorage.instance;
  }

  async storeVideoWithTracking(
    videoUrl: string,
    userId: string,
    filename: string,
    videoId: string
  ): Promise<VideoStorageResult> {
    console.log('[EnhancedVideoStorage] Starting video storage with tracking:', { videoUrl, userId, filename, videoId });

    try {
      // Update status to downloading
      await videoTracker.updateVideoStatus(videoId, {
        status: 'downloading',
        progress: 0
      });

      // Download with progress tracking
      const downloadResult = await this.downloadWithProgress(videoUrl, videoId);
      
      if (!downloadResult.success || !downloadResult.blob) {
        throw new Error(downloadResult.error || 'Download failed');
      }

      console.log('[EnhancedVideoStorage] Download completed, starting storage...');

      // Update status to storing
      await videoTracker.updateVideoStatus(videoId, {
        status: 'storing',
        progress: 90,
        file_size: downloadResult.blob.size
      });

      // Upload to Supabase Storage with progress tracking
      const uploadResult = await this.uploadWithProgress(
        downloadResult.blob,
        userId,
        filename,
        videoId
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      console.log('[EnhancedVideoStorage] Upload completed, verifying integrity...');

      // Verify file integrity
      const integrityVerified = await this.verifyFileIntegrity(
        uploadResult.publicUrl!,
        downloadResult.blob.size
      );

      // Mark as completed
      await videoTracker.markVideoCompleted(
        videoId,
        uploadResult.publicUrl!,
        uploadResult.storagePath!,
        downloadResult.blob.size,
        integrityVerified
      );

      console.log('[EnhancedVideoStorage] Video storage completed successfully');

      return {
        success: true,
        publicUrl: uploadResult.publicUrl,
        storagePath: uploadResult.storagePath,
        fileSize: downloadResult.blob.size,
        integrityVerified
      };

    } catch (error: any) {
      console.error('[EnhancedVideoStorage] Video storage failed:', error);
      
      await videoTracker.markVideoFailed(videoId, error.message);
      
      return {
        success: false,
        error: error.message || 'Unknown error occurred during video storage'
      };
    }
  }

  private async downloadWithProgress(
    videoUrl: string,
    videoId: string
  ): Promise<{ success: boolean; blob?: Blob; error?: string }> {
    try {
      console.log('[EnhancedVideoStorage] Starting download with progress tracking');

      const response = await fetch(videoUrl, {
        mode: 'cors',
        headers: {
          'Accept': 'video/*',
          'User-Agent': 'Mozilla/5.0 (compatible; VideoDownloader/1.0)'
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength) : 0;

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let downloadedBytes = 0;
      let startTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        downloadedBytes += value.length;

        // Calculate progress and speed
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = downloadedBytes / elapsed;
        const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
        const estimatedTimeRemaining = totalBytes > 0 ? (totalBytes - downloadedBytes) / speed : 0;

        // Update progress
        await videoTracker.updateDownloadProgress(videoId, progress, totalBytes);

        // Notify progress callback if registered
        const callback = this.downloadProgressCallbacks.get(videoId);
        if (callback) {
          callback({
            videoId,
            progress,
            downloadedBytes,
            totalBytes,
            speed,
            estimatedTimeRemaining
          });
        }

        // Log progress every 10%
        if (Math.floor(progress) % 10 === 0) {
          console.log(`[EnhancedVideoStorage] Download progress: ${progress.toFixed(1)}%`);
        }
      }

      // Combine chunks into blob
      const blob = new Blob(chunks, { type: 'video/mp4' });
      
      console.log('[EnhancedVideoStorage] Download completed:', {
        downloadedBytes,
        totalBytes,
        blobSize: blob.size
      });

      return { success: true, blob };

    } catch (error: any) {
      console.error('[EnhancedVideoStorage] Download error:', error);
      return { success: false, error: error.message };
    }
  }

  private async uploadWithProgress(
    blob: Blob,
    userId: string,
    filename: string,
    videoId: string
  ): Promise<{ success: boolean; publicUrl?: string; storagePath?: string; error?: string }> {
    try {
      console.log('[EnhancedVideoStorage] Starting upload with progress tracking');

      // Generate unique file path
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const storagePath = `videos/${userId}/${timestamp}-${randomId}-${filename}.mp4`;

      // Upload with retry logic
      let uploadError: any = null;
      let uploadData: any = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[EnhancedVideoStorage] Upload attempt ${attempt}/3`);
          
          // Update storage progress
          const baseProgress = 50 + (attempt - 1) * 15; // 50%, 65%, 80%
          await videoTracker.updateStorageProgress(videoId, baseProgress);

          const { data, error } = await supabase.storage
            .from('generated-videos')
            .upload(storagePath, blob, {
              contentType: 'video/mp4',
              cacheControl: '3600',
              upsert: false
            });

          if (error) {
            uploadError = error;
            console.error(`[EnhancedVideoStorage] Upload attempt ${attempt} failed:`, error);
            
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
          } else {
            uploadData = data;
            uploadError = null;
            break;
          }
        } catch (error) {
          uploadError = error;
          console.error(`[EnhancedVideoStorage] Upload attempt ${attempt} exception:`, error);
          
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      if (uploadError) {
        throw new Error(`Upload failed after 3 attempts: ${uploadError.message}`);
      }

      // Update storage progress to 100%
      await videoTracker.updateStorageProgress(videoId, 100);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('generated-videos')
        .getPublicUrl(storagePath);

      if (!urlData.publicUrl) {
        throw new Error('Failed to get public URL');
      }

      console.log('[EnhancedVideoStorage] Upload completed successfully');

      return {
        success: true,
        publicUrl: urlData.publicUrl,
        storagePath: storagePath
      };

    } catch (error: any) {
      console.error('[EnhancedVideoStorage] Upload error:', error);
      return {
        success: false,
        error: error.message || 'Upload failed'
      };
    }
  }

  private async verifyFileIntegrity(publicUrl: string, expectedSize: number): Promise<boolean> {
    try {
      console.log('[EnhancedVideoStorage] Verifying file integrity');

      const response = await fetch(publicUrl, { method: 'HEAD' });
      
      if (!response.ok) {
        console.error('[EnhancedVideoStorage] Integrity check failed: file not accessible');
        return false;
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const actualSize = parseInt(contentLength);
        if (actualSize !== expectedSize) {
          console.error('[EnhancedVideoStorage] Integrity check failed: size mismatch', {
            expected: expectedSize,
            actual: actualSize
          });
          return false;
        }
      }

      console.log('[EnhancedVideoStorage] File integrity verified');
      return true;

    } catch (error) {
      console.error('[EnhancedVideoStorage] Integrity verification error:', error);
      return false;
    }
  }

  subscribeToDownloadProgress(
    videoId: string,
    callback: (progress: VideoDownloadProgress) => void
  ): () => void {
    this.downloadProgressCallbacks.set(videoId, callback);
    
    return () => {
      this.downloadProgressCallbacks.delete(videoId);
    };
  }

  async getStorageUsage(userId: string): Promise<{
    usedBytes: number;
    availableBytes: number;
    totalBytes: number;
    fileCount: number;
  }> {
    try {
      const { data: files, error } = await supabase.storage
        .from('generated-videos')
        .list(`videos/${userId}`, {
          limit: 1000,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        console.error('[EnhancedVideoStorage] Error fetching storage usage:', error);
        return { usedBytes: 0, availableBytes: 0, totalBytes: 0, fileCount: 0 };
      }

      const usedBytes = (files || []).reduce((total, file) => {
        return total + (file.metadata?.size || 0);
      }, 0);

      // Example limits - adjust based on your business logic
      const totalBytes = 1024 * 1024 * 1024; // 1GB
      const availableBytes = Math.max(0, totalBytes - usedBytes);

      return {
        usedBytes,
        availableBytes,
        totalBytes,
        fileCount: files?.length || 0
      };

    } catch (error) {
      console.error('[EnhancedVideoStorage] Error calculating storage usage:', error);
      return { usedBytes: 0, availableBytes: 0, totalBytes: 0, fileCount: 0 };
    }
  }
}

export const enhancedVideoStorage = EnhancedVideoStorage.getInstance();