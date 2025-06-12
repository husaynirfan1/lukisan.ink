import { supabase } from './supabase';
import { checkVideoStatus, TaskStatusResponse } from './piapi';
import toast from 'react-hot-toast';

// Constants for configuration
const MAX_RETRIES = 3;
const INITIAL_POLL_INTERVAL = 15000; // 15 seconds
const MAX_POLL_INTERVAL = 60000; // 60 seconds
const POLL_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export interface VideoProcessingResult {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  storagePath?: string;
  error?: string;
  stage?: string;
}

export interface VideoProcessingProgress {
  stage: 'checking' | 'downloading' | 'uploading' | 'completed' | 'failed';
  progress: number;
  message: string;
  videoId: string;
}

export class EnhancedVideoProcessor {
  private static instance: EnhancedVideoProcessor;
  private activeProcessors: Map<string, AbortController> = new Map();
  private progressCallbacks: Map<string, (progress: VideoProcessingProgress) => void> = new Map();

  private constructor() {}

  static getInstance(): EnhancedVideoProcessor {
    if (!EnhancedVideoProcessor.instance) {
      EnhancedVideoProcessor.instance = new EnhancedVideoProcessor();
    }
    return EnhancedVideoProcessor.instance;
  }

  /**
   * Start comprehensive video processing workflow
   */
  async processVideo(
    taskId: string,
    videoDbId: string,
    userId: string,
    onProgress?: (progress: VideoProcessingProgress) => void
  ): Promise<VideoProcessingResult> {
    console.log(`[EnhancedVideoProcessor] Starting processing for task: ${taskId}, video: ${videoDbId}`);

    // Store progress callback
    if (onProgress) {
      this.progressCallbacks.set(videoDbId, onProgress);
    }

    // Create abort controller for this processing session
    const abortController = new AbortController();
    this.activeProcessors.set(videoDbId, abortController);

    try {
      // Step 1: Monitor video generation status
      const statusResult = await this.monitorVideoStatus(taskId, videoDbId, abortController.signal);
      
      if (!statusResult.success || !statusResult.videoUrl) {
        throw new Error(statusResult.error || 'Failed to get video URL from PiAPI');
      }

      // Step 2: Download and store video
      const storageResult = await this.downloadAndStoreVideo(
        statusResult.videoUrl,
        userId,
        taskId,
        videoDbId,
        abortController.signal
      );

      if (!storageResult.success) {
        throw new Error(storageResult.error || 'Failed to store video');
      }

      // Step 3: Update database with final video URL
      await this.updateVideoInDatabase(videoDbId, {
        video_url: storageResult.publicUrl!,
        storage_path: storageResult.storagePath,
        status: 'completed',
        progress: 100,
        error_message: null
      });

      this.notifyProgress(videoDbId, {
        stage: 'completed',
        progress: 100,
        message: 'Video processing completed successfully!',
        videoId: videoDbId
      });

      console.log(`[EnhancedVideoProcessor] Successfully processed video ${videoDbId}`);
      
      return {
        success: true,
        videoId: videoDbId,
        videoUrl: storageResult.publicUrl,
        storagePath: storageResult.storagePath
      };

    } catch (error: any) {
      console.error(`[EnhancedVideoProcessor] Processing failed for video ${videoDbId}:`, error);
      
      // Update database with error
      await this.updateVideoInDatabase(videoDbId, {
        status: 'failed',
        error_message: this.serializeError(error),
        progress: 0
      });

      this.notifyProgress(videoDbId, {
        stage: 'failed',
        progress: 0,
        message: `Processing failed: ${this.serializeError(error)}`,
        videoId: videoDbId
      });

      return {
        success: false,
        error: this.serializeError(error),
        stage: 'failed'
      };
    } finally {
      // Cleanup
      this.activeProcessors.delete(videoDbId);
      this.progressCallbacks.delete(videoDbId);
    }
  }

  /**
   * Monitor video generation status with exponential backoff
   */
  private async monitorVideoStatus(
    taskId: string,
    videoDbId: string,
    signal: AbortSignal
  ): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
    console.log(`[EnhancedVideoProcessor] Starting status monitoring for task: ${taskId}`);
    
    const startTime = Date.now();
    let pollInterval = INITIAL_POLL_INTERVAL;
    let consecutiveErrors = 0;

    while (!signal.aborted) {
      // Check timeout
      if (Date.now() - startTime > POLL_TIMEOUT) {
        throw new Error('Video processing timeout - exceeded 30 minutes');
      }

      try {
        this.notifyProgress(videoDbId, {
          stage: 'checking',
          progress: Math.min(90, 10 + ((Date.now() - startTime) / POLL_TIMEOUT) * 80),
          message: 'Checking video generation status...',
          videoId: videoDbId
        });

        console.log(`[EnhancedVideoProcessor] Checking status for task: ${taskId}`);
        const statusResponse = await checkVideoStatus(taskId);
        
        console.log(`[EnhancedVideoProcessor] Status response:`, statusResponse);

        // Reset error counter on successful check
        consecutiveErrors = 0;

        // Update database with current status
        await this.updateVideoInDatabase(videoDbId, {
          status: statusResponse.status,
          progress: statusResponse.progress || 0,
          error_message: statusResponse.error ? this.serializeError(statusResponse.error) : null
        });

        // Check if completed
        if (statusResponse.status === 'completed') {
          const videoUrl = this.extractVideoUrl(statusResponse);
          
          if (videoUrl) {
            console.log(`[EnhancedVideoProcessor] Video completed with URL: ${videoUrl}`);
            return { success: true, videoUrl };
          } else {
            throw new Error('Video marked as completed but no video URL found in response');
          }
        }

        // Check if failed
        if (statusResponse.status === 'failed') {
          const errorMsg = statusResponse.error || 'Video generation failed without specific error';
          throw new Error(errorMsg);
        }

        // Continue polling for pending/processing status
        console.log(`[EnhancedVideoProcessor] Video still ${statusResponse.status}, continuing to poll...`);

      } catch (error: any) {
        consecutiveErrors++;
        console.error(`[EnhancedVideoProcessor] Status check error (${consecutiveErrors}/${MAX_RETRIES}):`, error);

        if (consecutiveErrors >= MAX_RETRIES) {
          throw new Error(`Failed to check video status after ${MAX_RETRIES} attempts: ${this.serializeError(error)}`);
        }

        // Update database with error but continue polling
        await this.updateVideoInDatabase(videoDbId, {
          error_message: `Status check error (attempt ${consecutiveErrors}): ${this.serializeError(error)}`
        });
      }

      // Wait before next poll (with exponential backoff)
      if (!signal.aborted) {
        await this.sleep(pollInterval);
        pollInterval = Math.min(pollInterval * 1.2, MAX_POLL_INTERVAL);
      }
    }

    throw new Error('Video processing was aborted');
  }

  /**
   * Extract video URL from PiAPI response
   */
  private extractVideoUrl(statusResponse: TaskStatusResponse): string | null {
    console.log(`[EnhancedVideoProcessor] Extracting video URL from response:`, statusResponse);

    // Try direct video_url first
    if (statusResponse.video_url) {
      console.log(`[EnhancedVideoProcessor] Found direct video_url: ${statusResponse.video_url}`);
      return statusResponse.video_url;
    }

    // Try extracting from data.works array
    if (statusResponse.data?.works && statusResponse.data.works.length > 0) {
      const work = statusResponse.data.works[0];
      
      // Prefer resourceWithoutWatermark over resource
      if (work.resource?.resourceWithoutWatermark) {
        console.log(`[EnhancedVideoProcessor] Found resourceWithoutWatermark: ${work.resource.resourceWithoutWatermark}`);
        return work.resource.resourceWithoutWatermark;
      }
      
      if (work.resource?.resource) {
        console.log(`[EnhancedVideoProcessor] Found resource: ${work.resource.resource}`);
        return work.resource.resource;
      }
    }

    console.warn(`[EnhancedVideoProcessor] No video URL found in response`);
    return null;
  }

  /**
   * Download video and store in Supabase storage
   */
  private async downloadAndStoreVideo(
    videoUrl: string,
    userId: string,
    taskId: string,
    videoDbId: string,
    signal: AbortSignal
  ): Promise<{ success: boolean; publicUrl?: string; storagePath?: string; error?: string }> {
    console.log(`[EnhancedVideoProcessor] Starting download and storage for: ${videoUrl}`);

    try {
      // Step 1: Download video with progress tracking
      this.notifyProgress(videoDbId, {
        stage: 'downloading',
        progress: 0,
        message: 'Downloading video from PiAPI...',
        videoId: videoDbId
      });

      const downloadResult = await this.downloadVideoWithProgress(videoUrl, videoDbId, signal);
      
      if (!downloadResult.success || !downloadResult.blob) {
        throw new Error(downloadResult.error || 'Failed to download video');
      }

      // Step 2: Upload to Supabase Storage
      this.notifyProgress(videoDbId, {
        stage: 'uploading',
        progress: 50,
        message: 'Uploading to your library...',
        videoId: videoDbId
      });

      const uploadResult = await this.uploadToSupabaseStorage(
        downloadResult.blob,
        userId,
        taskId,
        videoDbId,
        signal
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload video');
      }

      console.log(`[EnhancedVideoProcessor] Successfully stored video: ${uploadResult.publicUrl}`);
      
      return {
        success: true,
        publicUrl: uploadResult.publicUrl,
        storagePath: uploadResult.storagePath
      };

    } catch (error: any) {
      console.error(`[EnhancedVideoProcessor] Download and storage failed:`, error);
      return {
        success: false,
        error: this.serializeError(error)
      };
    }
  }

  /**
   * Download video with progress tracking
   */
  private async downloadVideoWithProgress(
    videoUrl: string,
    videoDbId: string,
    signal: AbortSignal
  ): Promise<{ success: boolean; blob?: Blob; error?: string }> {
    try {
      console.log(`[EnhancedVideoProcessor] Downloading video from: ${videoUrl}`);

      const response = await fetch(videoUrl, {
        mode: 'cors',
        headers: {
          'Accept': 'video/*',
          'User-Agent': 'Mozilla/5.0 (compatible; VideoDownloader/1.0)'
        },
        signal
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

      while (true) {
        if (signal.aborted) {
          throw new Error('Download aborted');
        }

        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        downloadedBytes += value.length;

        // Update progress
        const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 50 : 25; // 0-50% for download
        
        this.notifyProgress(videoDbId, {
          stage: 'downloading',
          progress,
          message: `Downloading video... ${this.formatBytes(downloadedBytes)}${totalBytes ? ` / ${this.formatBytes(totalBytes)}` : ''}`,
          videoId: videoDbId
        });
      }

      // Combine chunks into blob
      const blob = new Blob(chunks, { type: 'video/mp4' });
      
      console.log(`[EnhancedVideoProcessor] Download completed: ${blob.size} bytes`);
      
      return { success: true, blob };

    } catch (error: any) {
      console.error(`[EnhancedVideoProcessor] Download error:`, error);
      return { 
        success: false, 
        error: this.serializeError(error)
      };
    }
  }

  /**
   * Upload video to Supabase Storage
   */
  private async uploadToSupabaseStorage(
    blob: Blob,
    userId: string,
    taskId: string,
    videoDbId: string,
    signal: AbortSignal
  ): Promise<{ success: boolean; publicUrl?: string; storagePath?: string; error?: string }> {
    try {
      console.log(`[EnhancedVideoProcessor] Uploading to Supabase Storage...`);

      // Generate unique file path
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const storagePath = `videos/${userId}/${timestamp}-${randomId}-${taskId}.mp4`;

      // Upload with retry logic
      let uploadError: any = null;
      let uploadData: any = null;
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (signal.aborted) {
          throw new Error('Upload aborted');
        }

        try {
          console.log(`[EnhancedVideoProcessor] Upload attempt ${attempt}/${MAX_RETRIES}`);
          
          const progress = 50 + (attempt - 1) * 15; // 50%, 65%, 80%
          this.notifyProgress(videoDbId, {
            stage: 'uploading',
            progress,
            message: `Uploading to storage (attempt ${attempt})...`,
            videoId: videoDbId
          });

          const { data, error } = await supabase.storage
            .from('generated-videos')
            .upload(storagePath, blob, {
              contentType: 'video/mp4',
              cacheControl: '3600',
              upsert: false
            });

          if (error) {
            uploadError = error;
            console.error(`[EnhancedVideoProcessor] Upload attempt ${attempt} failed:`, error);
            
            if (attempt < MAX_RETRIES) {
              await this.sleep(1000 * attempt);
              continue;
            }
          } else {
            uploadData = data;
            uploadError = null;
            break;
          }
        } catch (error) {
          uploadError = error;
          console.error(`[EnhancedVideoProcessor] Upload attempt ${attempt} exception:`, error);
          
          if (attempt < MAX_RETRIES) {
            await this.sleep(1000 * attempt);
          }
        }
      }

      if (uploadError) {
        throw new Error(`Upload failed after ${MAX_RETRIES} attempts: ${this.serializeError(uploadError)}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('generated-videos')
        .getPublicUrl(storagePath);

      if (!urlData.publicUrl) {
        throw new Error('Failed to get public URL');
      }

      console.log(`[EnhancedVideoProcessor] Upload completed successfully: ${urlData.publicUrl}`);

      return {
        success: true,
        publicUrl: urlData.publicUrl,
        storagePath: storagePath
      };

    } catch (error: any) {
      console.error(`[EnhancedVideoProcessor] Upload error:`, error);
      return {
        success: false,
        error: this.serializeError(error)
      };
    }
  }

  /**
   * Update video record in database
   */
  private async updateVideoInDatabase(videoDbId: string, updates: any): Promise<void> {
    try {
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('video_generations')
        .update(updateData)
        .eq('id', videoDbId);

      if (error) {
        console.error(`[EnhancedVideoProcessor] Database update error:`, error);
        throw error;
      }

      console.log(`[EnhancedVideoProcessor] Database updated for video ${videoDbId}:`, updates);
    } catch (error) {
      console.error(`[EnhancedVideoProcessor] Failed to update database:`, error);
      // Don't throw here to avoid breaking the main flow
    }
  }

  /**
   * Notify progress to callback
   */
  private notifyProgress(videoDbId: string, progress: VideoProcessingProgress): void {
    const callback = this.progressCallbacks.get(videoDbId);
    if (callback) {
      callback(progress);
    }
  }

  /**
   * Properly serialize error objects to strings
   */
  private serializeError(error: any): string {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error instanceof Error) {
      return error.message;
    }
    
    if (error && typeof error === 'object') {
      return JSON.stringify(error, Object.getOwnPropertyNames(error));
    }
    
    return String(error);
  }

  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop processing for a specific video
   */
  stopProcessing(videoDbId: string): void {
    const controller = this.activeProcessors.get(videoDbId);
    if (controller) {
      controller.abort();
      this.activeProcessors.delete(videoDbId);
      this.progressCallbacks.delete(videoDbId);
      console.log(`[EnhancedVideoProcessor] Stopped processing for video: ${videoDbId}`);
    }
  }

  /**
   * Stop all active processing
   */
  stopAllProcessing(): void {
    for (const [videoDbId, controller] of this.activeProcessors) {
      controller.abort();
      console.log(`[EnhancedVideoProcessor] Stopped processing for video: ${videoDbId}`);
    }
    this.activeProcessors.clear();
    this.progressCallbacks.clear();
  }

  /**
   * Get processing status
   */
  getProcessingStatus(): { activeVideos: string[], totalActive: number } {
    return {
      activeVideos: Array.from(this.activeProcessors.keys()),
      totalActive: this.activeProcessors.size
    };
  }
}

export const enhancedVideoProcessor = EnhancedVideoProcessor.getInstance();