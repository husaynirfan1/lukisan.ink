import { supabase } from './supabase';
import { checkVideoStatus } from './piapi';
import toast from 'react-hot-toast';

// Constants for polling configuration
const POLL_INTERVAL = 5000; // 5 seconds as specified in requirements
const MAX_POLLING_ATTEMPTS = 180; // 15 minutes maximum polling time

export interface VideoProcessingResult {
  success: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

/**
 * Comprehensive service for video processing workflow
 * Handles the entire lifecycle from monitoring to storage
 */
class VideoProcessingService {
  private static instance: VideoProcessingService;
  private activeProcessors: Map<string, { 
    controller: AbortController;
    startTime: number;
    attempts: number;
  }> = new Map();

  private constructor() {}

  public static getInstance(): VideoProcessingService {
    if (!VideoProcessingService.instance) {
      VideoProcessingService.instance = new VideoProcessingService();
    }
    return VideoProcessingService.instance;
  }

  /**
   * Start monitoring a video processing task
   * @param taskId PiAPI task ID
   * @param videoDbId Database record ID
   * @param userId User ID
   */
  public startProcessing(taskId: string, videoDbId: string, userId: string): void {
    if (this.activeProcessors.has(videoDbId)) {
      console.log(`[VideoProcessor] Already monitoring video ${videoDbId}`);
      return;
    }

    console.log(`[VideoProcessor] Starting processing for video ${videoDbId} (task: ${taskId})`);
    
    // Create abort controller for cancellation
    const controller = new AbortController();
    this.activeProcessors.set(videoDbId, { 
      controller, 
      startTime: Date.now(),
      attempts: 0
    });

    // Start the processing workflow
    this.processVideoWorkflow(taskId, videoDbId, userId, controller.signal)
      .catch(error => {
        console.error(`[VideoProcessor] Processing failed for video ${videoDbId}:`, error);
        
        // Extract error message safely
        let errorMessage = 'Unknown error occurred';
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
          errorMessage = String(error.message);
        }
        
        // Update database with error
        this.updateVideoRecord(videoDbId, {
          status: 'failed',
          error_message: errorMessage,
          progress: 0
        }).catch(dbError => {
          console.error(`[VideoProcessor] Failed to update error status:`, dbError);
        });
        
        // Show error toast
        toast.error(`Video processing failed: ${errorMessage}`);
      })
      .finally(() => {
        // Clean up
        this.activeProcessors.delete(videoDbId);
        console.log(`[VideoProcessor] Finished processing for video ${videoDbId}`);
      });
  }

  /**
   * Stop processing a video
   * @param videoDbId Database record ID
   */
  public stopProcessing(videoDbId: string): void {
    const processor = this.activeProcessors.get(videoDbId);
    if (processor) {
      processor.controller.abort();
      this.activeProcessors.delete(videoDbId);
      console.log(`[VideoProcessor] Stopped processing for video ${videoDbId}`);
    }
  }

  /**
   * Get the status of all active processors
   */
  public getProcessingStatus(): { 
    activeVideos: string[]; 
    processingDetails: Record<string, { 
      elapsedTime: number; 
      attempts: number;
    }>;
  } {
    const activeVideos = Array.from(this.activeProcessors.keys());
    const processingDetails: Record<string, { elapsedTime: number; attempts: number }> = {};
    
    for (const [videoId, details] of this.activeProcessors.entries()) {
      processingDetails[videoId] = {
        elapsedTime: Date.now() - details.startTime,
        attempts: details.attempts
      };
    }
    
    return {
      activeVideos,
      processingDetails
    };
  }

  /**
   * Main workflow for processing a video
   * Handles the entire lifecycle from monitoring to storage
   */
  private async processVideoWorkflow(
    taskId: string, 
    videoDbId: string, 
    userId: string,
    signal: AbortSignal
  ): Promise<VideoProcessingResult> {
    // Step 1: Monitor the PiAPI task until completion
    const processorDetails = this.activeProcessors.get(videoDbId);
    if (!processorDetails) {
      throw new Error('Processor details not found');
    }

    // Update status to processing
    await this.updateVideoRecord(videoDbId, {
      status: 'processing',
      progress: 0
    });

    // Poll for status until completion
    let videoUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    
    for (let attempt = 0; attempt < MAX_POLLING_ATTEMPTS; attempt++) {
      // Check if processing was cancelled
      if (signal.aborted) {
        throw new Error('Processing was cancelled');
      }
      
      // Update attempts counter
      processorDetails.attempts = attempt + 1;
      
      try {
        // Get status from PiAPI
        const statusResponse = await checkVideoStatus(taskId);
        
        // Update progress in database
        await this.updateVideoRecord(videoDbId, {
          status: statusResponse.status,
          progress: statusResponse.progress || Math.min(5 + attempt * 5, 90), // Fallback progress calculation
        });
        
        // Check if completed
        if (statusResponse.status === 'completed' && statusResponse.video_url) {
          videoUrl = statusResponse.video_url;
          thumbnailUrl = statusResponse.thumbnail_url;
          break;
        }
        
        // Check if failed
        if (statusResponse.status === 'failed') {
          throw new Error(statusResponse.error || 'Video processing failed on PiAPI');
        }
        
        // Wait for next poll
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      } catch (error) {
        console.error(`[VideoProcessor] Error checking status (attempt ${attempt + 1}):`, error);
        
        // If this is the last attempt, throw the error
        if (attempt === MAX_POLLING_ATTEMPTS - 1) {
          throw error;
        }
        
        // Otherwise, continue polling
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      }
    }
    
    // If we didn't get a video URL, throw an error
    if (!videoUrl) {
      throw new Error('Maximum polling attempts reached without completion');
    }
    
    // Step 2: Download the video from PiAPI
    await this.updateVideoRecord(videoDbId, {
      status: 'downloading',
      progress: 92
    });
    
    console.log(`[VideoProcessor] Downloading video from ${videoUrl}`);
    const videoBlob = await this.downloadVideo(videoUrl);
    
    // Step 3: Store the video in Supabase Storage
    await this.updateVideoRecord(videoDbId, {
      status: 'storing',
      progress: 96
    });
    
    const storageResult = await this.storeVideoInSupabase(videoBlob, userId, taskId);
    
    // Step 4: Update the database with the final URL
    await this.updateVideoRecord(videoDbId, {
      status: 'completed',
      progress: 100,
      video_url: storageResult.publicUrl,
      storage_path: storageResult.storagePath,
      file_size: videoBlob.size,
      thumbnail_url: thumbnailUrl,
      error_message: null
    });
    
    // Step 5: Return success
    return {
      success: true,
      videoUrl: storageResult.publicUrl,
      thumbnailUrl
    };
  }

  /**
   * Download a video from a URL
   */
  private async downloadVideo(url: string): Promise<Blob> {
    const response = await fetch(url, {
      mode: 'cors',
      headers: {
        'Accept': 'video/*',
        'User-Agent': 'Mozilla/5.0 (compatible; VideoDownloader/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    }
    
    return await response.blob();
  }

  /**
   * Store a video in Supabase Storage
   */
  private async storeVideoInSupabase(
    videoBlob: Blob, 
    userId: string, 
    taskId: string
  ): Promise<{ publicUrl: string; storagePath: string }> {
    // Generate a unique file path
    const timestamp = Date.now();
    const filePath = `videos/${userId}/${timestamp}-${taskId}.mp4`;
    
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('generated-videos')
      .upload(filePath, videoBlob, {
        contentType: 'video/mp4',
        cacheControl: '3600',
        upsert: true
      });
    
    if (uploadError) {
      throw new Error(`Failed to upload video to storage: ${uploadError.message}`);
    }
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('generated-videos')
      .getPublicUrl(filePath);
    
    if (!urlData.publicUrl) {
      throw new Error('Failed to get public URL from storage');
    }
    
    return {
      publicUrl: urlData.publicUrl,
      storagePath: filePath
    };
  }

  /**
   * Update a video record in the database
   */
  private async updateVideoRecord(videoId: string, updates: any): Promise<void> {
    const { error } = await supabase
      .from('video_generations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId);
    
    if (error) {
      console.error(`[VideoProcessor] Failed to update video record:`, error);
      throw new Error(`Database update failed: ${error.message}`);
    }
  }

  /**
   * Force check the status of a video
   * Used for manual status checks from the UI
   */
  public async forceCheckStatus(videoDbId: string): Promise<void> {
    try {
      // Get the video record
      const { data: video, error: fetchError } = await supabase
        .from('video_generations')
        .select('id, video_id, user_id, status')
        .eq('id', videoDbId)
        .single();
      
      if (fetchError || !video) {
        throw new Error(fetchError?.message || 'Video not found');
      }
      
      // If the video is already completed, no need to check
      if (video.status === 'completed') {
        return;
      }
      
      // If the video is already being processed, no need to start a new process
      if (this.activeProcessors.has(videoDbId)) {
        return;
      }
      
      // Start processing the video
      this.startProcessing(video.video_id, video.id, video.user_id);
      
    } catch (error) {
      console.error(`[VideoProcessor] Force check failed:`, error);
      throw error;
    }
  }
}

export const videoProcessingService = VideoProcessingService.getInstance();