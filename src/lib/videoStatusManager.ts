import { supabase } from './supabase';
import { checkVideoStatus, type TaskStatusResponse } from './piapi';
import { enhancedVideoStorage } from './enhancedVideoStorage';
import { videoTracker } from './videoTracker';
import toast from 'react-hot-toast';

export interface VideoStatusUpdate {
  id: string;
  status: 'pending' | 'processing' | 'running' | 'downloading' | 'storing' | 'completed' | 'failed';
  progress?: number;
  video_url?: string;
  error?: string;
}

export class VideoStatusManager {
  private static instance: VideoStatusManager;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private consecutiveErrors: Map<string, number> = new Map();
  private maxConsecutiveErrors = 3;

  private constructor() {}

  static getInstance(): VideoStatusManager {
    if (!VideoStatusManager.instance) {
      VideoStatusManager.instance = new VideoStatusManager();
    }
    return VideoStatusManager.instance;
  }

  startMonitoring(videoId: string, taskId: string, userId: string): void {
    if (this.pollingIntervals.has(videoId)) {
      console.log(`[VideoStatusManager] Already monitoring video ${videoId}`);
      return; // Already monitoring
    }

    console.log(`[VideoStatusManager] Starting monitoring for video ${videoId}, task ${taskId}`);
    this.consecutiveErrors.set(videoId, 0);

    const interval = setInterval(async () => {
      await this.checkAndProcessVideoStatus(videoId, taskId, userId);
    }, 10000); // Check every 10 seconds

    this.pollingIntervals.set(videoId, interval);
    
    // Initial check
    this.checkAndProcessVideoStatus(videoId, taskId, userId);
  }

  stopMonitoring(videoId: string): void {
    const interval = this.pollingIntervals.get(videoId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(videoId);
      this.consecutiveErrors.delete(videoId);
      console.log(`[VideoStatusManager] Stopped monitoring video ${videoId}`);
    }
  }
  
  private async checkAndProcessVideoStatus(videoId: string, taskId: string, userId: string): Promise<void> {
    try {
      console.log(`[VideoStatusManager] Checking status for video ${videoId}, task ${taskId}`);
      
      const statusResponse = await checkVideoStatus(taskId);
      console.log(`[VideoStatusManager] Status response:`, statusResponse);

      // Reset error counter on successful check
      this.consecutiveErrors.set(videoId, 0);

      // Update the video tracker with current status
      await videoTracker.updateVideoStatus(videoId, {
        status: statusResponse.status,
        progress: statusResponse.progress || 0,
        error_message: statusResponse.error
      });

      if (statusResponse.status === 'completed' && statusResponse.video_url) {
        // Stop polling this task as it's completed
        this.stopMonitoring(videoId);
        console.log(`[VideoStatusManager] Video ${videoId} completed, processing video storage`);
        
        // Process the completed video with enhanced storage
        await this.handleVideoCompletion(videoId, statusResponse.video_url, userId, taskId);
      } else if (statusResponse.status === 'failed') {
        this.stopMonitoring(videoId);
        console.log(`[VideoStatusManager] Video ${videoId} failed:`, statusResponse.error);
        await videoTracker.markVideoFailed(videoId, statusResponse.error || 'Unknown error');
      }
      // For other statuses (pending, processing), continue polling

    } catch (error: any) {
      const errorCount = (this.consecutiveErrors.get(videoId) || 0) + 1;
      this.consecutiveErrors.set(videoId, errorCount);
      
      console.error(`[VideoStatusManager] Error checking status for video ${videoId} (attempt ${errorCount}):`, error);
      
      // If we've had too many consecutive errors, stop monitoring and mark as failed
      if (errorCount >= this.maxConsecutiveErrors) {
        this.stopMonitoring(videoId);
        await videoTracker.markVideoFailed(videoId, `Status check failed after ${errorCount} attempts: ${error.message}`);
        toast.error(`Video ${videoId} monitoring failed after multiple attempts`);
      }
      // Otherwise, continue polling - the error might be temporary
    }
  }

  /**
   * Handle video completion using the enhanced storage system
   */
  private async handleVideoCompletion(videoId: string, piapiVideoUrl: string, userId: string, taskId: string): Promise<void> {
    try {
      console.log(`[VideoStatusManager] Processing completed video ${videoId} with enhanced storage`);
      
      // Generate filename for the video
      const timestamp = Date.now();
      const filename = `video-${taskId}-${timestamp}`;
      
      console.log(`[VideoStatusManager] Starting enhanced video storage...`);
      
      // Use the enhanced video storage system with progress tracking
      const storeResult = await enhancedVideoStorage.storeVideoWithTracking(
        piapiVideoUrl,
        userId,
        filename,
        videoId
      );
      
      if (!storeResult.success) {
        throw new Error(storeResult.error || 'Failed to store video');
      }

      console.log(`[VideoStatusManager] Enhanced video storage completed successfully`);
      toast.success('Video generation completed and saved to library!');

    } catch (error: any) {
      console.error(`[VideoStatusManager] Error processing completed video:`, error);
      await videoTracker.markVideoFailed(videoId, `Failed to save to library: ${error.message}`);
    }
  }

  /**
   * Manually triggers a status check for a specific video.
   * This function is called by the "Re-check Status" button in the UI.
   */
  async manualStatusCheck(videoId: string, taskId: string, userId: string): Promise<void> {
    console.log(`[VideoStatusManager] Manual status check triggered for video ${videoId}`);
    
    // Reset error counter for manual checks
    this.consecutiveErrors.set(videoId, 0);
    
    // This calls the same central processing function as the automatic poller
    await this.checkAndProcessVideoStatus(videoId, taskId, userId);
  }

  /**
   * Get monitoring status for debugging
   */
  getMonitoringStatus(): { activeVideos: string[], errorCounts: Record<string, number> } {
    return {
      activeVideos: Array.from(this.pollingIntervals.keys()),
      errorCounts: Object.fromEntries(this.consecutiveErrors.entries())
    };
  }

  /**
   * Stop all monitoring (useful for cleanup)
   */
  stopAllMonitoring(): void {
    for (const videoId of this.pollingIntervals.keys()) {
      this.stopMonitoring(videoId);
    }
  }
}

export const videoStatusManager = VideoStatusManager.getInstance();