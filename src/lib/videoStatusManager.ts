import { supabase } from './supabase';
import { checkVideoStatus, type TaskStatusResponse } from './piapi';
import { storeVideoInSupabase } from './videoStorage';
import toast from 'react-hot-toast';

export interface VideoStatusUpdate {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  video_url?: string;
  error?: string;
}

export class VideoStatusManager {
  private static instance: VideoStatusManager;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private statusCallbacks: Map<string, (update: VideoStatusUpdate) => void> = new Map();
  private isPolling = false;

  private constructor() {}

  static getInstance(): VideoStatusManager {
    if (!VideoStatusManager.instance) {
      VideoStatusManager.instance = new VideoStatusManager();
    }
    return VideoStatusManager.instance;
  }

  /**
   * Start monitoring a video generation task
   */
  startMonitoring(
    videoId: string, 
    taskId: string, 
    userId: string,
    onStatusUpdate?: (update: VideoStatusUpdate) => void
  ): void {
    console.log(`[VideoStatusManager] Starting monitoring for video ${videoId} (task ${taskId})`);
    
    // Store callback if provided
    if (onStatusUpdate) {
      this.statusCallbacks.set(videoId, onStatusUpdate);
    }

    // Clear any existing interval for this video
    this.stopMonitoring(videoId);

    // Start polling
    const interval = setInterval(async () => {
      await this.checkVideoStatus(videoId, taskId, userId);
    }, 8000); // Check every 8 seconds

    this.pollingIntervals.set(videoId, interval);
    this.isPolling = true;

    // Initial status check
    setTimeout(() => this.checkVideoStatus(videoId, taskId, userId), 1000);
  }

  /**
   * Stop monitoring a specific video
   */
  stopMonitoring(videoId: string): void {
    const interval = this.pollingIntervals.get(videoId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(videoId);
      this.statusCallbacks.delete(videoId);
      console.log(`[VideoStatusManager] Stopped monitoring video ${videoId}`);
    }

    // Update polling state
    this.isPolling = this.pollingIntervals.size > 0;
  }

  /**
   * Stop all monitoring
   */
  stopAllMonitoring(): void {
    console.log(`[VideoStatusManager] Stopping all monitoring (${this.pollingIntervals.size} active)`);
    
    this.pollingIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    
    this.pollingIntervals.clear();
    this.statusCallbacks.clear();
    this.isPolling = false;
  }

  /**
   * Check if currently monitoring any videos
   */
  isActivelyMonitoring(): boolean {
    return this.isPolling;
  }

  /**
   * Get list of currently monitored video IDs
   */
  getMonitoredVideos(): string[] {
    return Array.from(this.pollingIntervals.keys());
  }

  /**
   * Check status of a specific video
   */
  private async checkVideoStatus(videoId: string, taskId: string, userId: string): Promise<void> {
    try {
      console.log(`[VideoStatusManager] Checking status for video ${videoId} (task ${taskId})`);
      
      const statusResponse = await checkVideoStatus(taskId);
      console.log(`[VideoStatusManager] Status response:`, statusResponse);

      const update: VideoStatusUpdate = {
        id: videoId,
        status: statusResponse.status,
        progress: statusResponse.progress || 0,
        video_url: statusResponse.video_url,
        error: statusResponse.error
      };

      // Call status callback if registered
      const callback = this.statusCallbacks.get(videoId);
      if (callback) {
        callback(update);
      }

      // Handle completion
      if (statusResponse.status === 'completed' && statusResponse.video_url) {
        await this.handleVideoCompletion(videoId, taskId, statusResponse.video_url, userId);
        this.stopMonitoring(videoId);
      } 
      // Handle failure
      else if (statusResponse.status === 'failed') {
        await this.handleVideoFailure(videoId, statusResponse.error || 'Unknown error');
        this.stopMonitoring(videoId);
      }
      // Continue monitoring for pending/processing
      else if (statusResponse.status === 'pending' || statusResponse.status === 'processing') {
        // Update database with progress if available
        if (statusResponse.progress !== undefined) {
          await this.updateVideoProgress(videoId, statusResponse.progress);
        }
      }

    } catch (error: any) {
      console.error(`[VideoStatusManager] Error checking status for video ${videoId}:`, error);
      
      // Don't stop monitoring on temporary errors, but limit retries
      const retryCount = this.getRetryCount(videoId);
      if (retryCount > 5) {
        console.error(`[VideoStatusManager] Too many failures for video ${videoId}, stopping monitoring`);
        await this.handleVideoFailure(videoId, 'Status check failed repeatedly');
        this.stopMonitoring(videoId);
      } else {
        this.incrementRetryCount(videoId);
      }
    }
  }

  /**
   * Handle video completion
   */
  private async handleVideoCompletion(videoId: string, taskId: string, videoUrl: string, userId: string): Promise<void> {
    try {
      console.log(`[VideoStatusManager] Video ${videoId} completed, storing in library`);
      
      // Store video in Supabase Storage
      const filename = `video-${taskId}`;
      const storeResult = await storeVideoInSupabase(videoUrl, userId, filename);
      
      let finalVideoUrl = videoUrl;
      let storagePath: string | undefined;
      
      if (storeResult.success && storeResult.publicUrl) {
        finalVideoUrl = storeResult.publicUrl;
        storagePath = storeResult.storagePath;
        console.log(`[VideoStatusManager] Video stored in Supabase Storage: ${finalVideoUrl}`);
      } else {
        console.warn(`[VideoStatusManager] Failed to store video in Supabase Storage, using original URL`);
      }

      // Update database with final video URL
      const updateData: any = { video_url: finalVideoUrl };
      if (storagePath) {
        updateData.storage_path = storagePath;
      }

      const { error } = await supabase
        .from('video_generations')
        .update(updateData)
        .eq('id', videoId);

      if (error) {
        console.error(`[VideoStatusManager] Error updating video URL in database:`, error);
      } else {
        console.log(`[VideoStatusManager] Successfully updated video URL in database`);
        
        // Show toast notification
        toast.success('Your video is ready for download!', {
          duration: 5000,
          icon: '🎬'
        });
      }
    } catch (error) {
      console.error(`[VideoStatusManager] Error handling video completion:`, error);
    }
  }

  /**
   * Handle video failure
   */
  private async handleVideoFailure(videoId: string, errorMessage: string): Promise<void> {
    try {
      console.log(`[VideoStatusManager] Video ${videoId} failed: ${errorMessage}`);
      
      // Update database with error
      const { error } = await supabase
        .from('video_generations')
        .update({
          video_url: 'failed',
          storage_path: `error: ${errorMessage}`
        })
        .eq('id', videoId);

      if (error) {
        console.error(`[VideoStatusManager] Error updating video failure in database:`, error);
      } else {
        console.log(`[VideoStatusManager] Successfully updated video failure in database`);
        
        // Show toast notification
        toast.error(`Video generation failed: ${errorMessage}`, {
          duration: 5000
        });
      }
    } catch (error) {
      console.error(`[VideoStatusManager] Error handling video failure:`, error);
    }
  }

  /**
   * Update video progress in database
   */
  private async updateVideoProgress(videoId: string, progress: number): Promise<void> {
    try {
      // Only update every 10% to reduce database writes
      if (progress % 10 !== 0) return;
      
      const { error } = await supabase
        .from('video_generations')
        .update({
          storage_path: `progress: ${progress}%`
        })
        .eq('id', videoId);

      if (error) {
        console.error(`[VideoStatusManager] Error updating progress in database:`, error);
      }
    } catch (error) {
      console.error(`[VideoStatusManager] Error updating progress:`, error);
    }
  }

  /**
   * Get retry count for a video
   */
  private getRetryCount(videoId: string): number {
    const key = `retry_${videoId}`;
    return parseInt(localStorage.getItem(key) || '0', 10);
  }

  /**
   * Increment retry count for a video
   */
  private incrementRetryCount(videoId: string): void {
    const key = `retry_${videoId}`;
    const count = this.getRetryCount(videoId) + 1;
    localStorage.setItem(key, count.toString());
  }

  /**
   * Reset retry count for a video
   */
  private resetRetryCount(videoId: string): void {
    const key = `retry_${videoId}`;
    localStorage.removeItem(key);
  }

  /**
   * Find and start monitoring all pending videos for a user
   */
  async monitorPendingVideos(userId: string): Promise<number> {
    try {
      console.log(`[VideoStatusManager] Finding pending videos for user ${userId}`);
      
      // Find videos that are still pending or processing
      const { data, error } = await supabase
        .from('video_generations')
        .select('*')
        .eq('user_id', userId)
        .or('video_url.eq.,video_url.eq.null,video_url.eq.pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`[VideoStatusManager] Error fetching pending videos:`, error);
        return 0;
      }

      if (!data || data.length === 0) {
        console.log(`[VideoStatusManager] No pending videos found`);
        return 0;
      }

      console.log(`[VideoStatusManager] Found ${data.length} pending videos`);
      
      // Start monitoring each pending video
      let startedCount = 0;
      for (const video of data) {
        if (!video.video_id) continue;
        
        // Skip if already monitoring
        if (this.pollingIntervals.has(video.id)) continue;
        
        this.startMonitoring(video.id, video.video_id, userId);
        startedCount++;
      }

      console.log(`[VideoStatusManager] Started monitoring ${startedCount} new videos`);
      return startedCount;
    } catch (error) {
      console.error(`[VideoStatusManager] Error monitoring pending videos:`, error);
      return 0;
    }
  }

  /**
   * Manually check status of a specific video
   */
  async manualStatusCheck(videoId: string, taskId: string, userId: string): Promise<TaskStatusResponse> {
    try {
      console.log(`[VideoStatusManager] Manual status check for video ${videoId} (task ${taskId})`);
      
      const statusResponse = await checkVideoStatus(taskId);
      console.log(`[VideoStatusManager] Manual status response:`, statusResponse);

      // Handle completion
      if (statusResponse.status === 'completed' && statusResponse.video_url) {
        await this.handleVideoCompletion(videoId, taskId, statusResponse.video_url, userId);
      } 
      // Handle failure
      else if (statusResponse.status === 'failed') {
        await this.handleVideoFailure(videoId, statusResponse.error || 'Unknown error');
      }
      // Update progress for pending/processing
      else if (statusResponse.progress !== undefined) {
        await this.updateVideoProgress(videoId, statusResponse.progress);
      }

      return statusResponse;
    } catch (error: any) {
      console.error(`[VideoStatusManager] Error in manual status check:`, error);
      throw error;
    }
  }
}

// Export a singleton instance
export const videoStatusManager = VideoStatusManager.getInstance();