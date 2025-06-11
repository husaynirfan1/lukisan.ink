import { supabase } from './supabase';
import { checkVideoStatus, type TaskStatusResponse } from './piapi';
import toast from 'react-hot-toast';

export interface VideoStatusUpdate {
  id: string;
  status: 'pending' | 'processing' | 'running' | 'completed' | 'failed';
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

      // Update the database with the current status
      await this.updateVideoStatus(videoId, statusResponse);

      if (statusResponse.status === 'completed' && statusResponse.video_url) {
        // Stop polling this task as it's completed
        this.stopMonitoring(videoId);
        console.log(`[VideoStatusManager] Video ${videoId} completed, delegating to backend`);
        
        // Delegate the complex work to the backend
        await this.handleVideoCompletionOnBackend(videoId, statusResponse.video_url, userId, taskId);
      } else if (statusResponse.status === 'failed') {
        this.stopMonitoring(videoId);
        console.log(`[VideoStatusManager] Video ${videoId} failed:`, statusResponse.error);
        await this.handleVideoFailure(videoId, statusResponse.error || 'Unknown error');
      }
      // For other statuses (pending, processing), continue polling

    } catch (error: any) {
      const errorCount = (this.consecutiveErrors.get(videoId) || 0) + 1;
      this.consecutiveErrors.set(videoId, errorCount);
      
      console.error(`[VideoStatusManager] Error checking status for video ${videoId} (attempt ${errorCount}):`, error);
      
      // If we've had too many consecutive errors, stop monitoring and mark as failed
      if (errorCount >= this.maxConsecutiveErrors) {
        this.stopMonitoring(videoId);
        await this.handleVideoFailure(videoId, `Status check failed after ${errorCount} attempts: ${error.message}`);
        toast.error(`Video ${videoId} monitoring failed after multiple attempts`);
      }
      // Otherwise, continue polling - the error might be temporary
    }
  }

  private async updateVideoStatus(videoId: string, statusResponse: TaskStatusResponse): Promise<void> {
    try {
      const updateData: any = {
        status: statusResponse.status,
        progress: statusResponse.progress || 0
      };

      if (statusResponse.error) {
        updateData.error_message = statusResponse.error;
      }

      const { error } = await supabase
        .from('video_generations')
        .update(updateData)
        .eq('id', videoId);

      if (error) {
        console.error(`[VideoStatusManager] Error updating video status:`, error);
      }
    } catch (error) {
      console.error(`[VideoStatusManager] Error updating video status:`, error);
    }
  }

  /**
   * This function calls our secure backend endpoint to process the video.
   */
  private async handleVideoCompletionOnBackend(videoId: string, piapiVideoUrl: string, userId: string, taskId: string): Promise<void> {
    try {
      console.log(`[VideoStatusManager] Notifying backend to process video ${videoId}`);
      
      const response = await fetch('/api/process-video', { // Your backend API route
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, piapiVideoUrl, userId, taskId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Backend processing failed');
      }

      const result = await response.json();
      console.log(`[VideoStatusManager] Backend successfully processed video ${videoId}:`, result);
      toast.success('Video processing complete and saved to your library!');
      // The frontend will update automatically via the realtime subscription.

    } catch (error: any) {
      console.error(`[VideoStatusManager] Error notifying backend:`, error);
      toast.error('Failed to save completed video to library.');
      // Update the status to 'failed' in the DB so it doesn't get stuck
      await this.handleVideoFailure(videoId, 'Failed to save to library: ' + error.message);
    }
  }

  private async handleVideoFailure(videoId: string, errorMessage: string): Promise<void> {
    try {
      await supabase
        .from('video_generations')
        .update({ 
          status: 'failed', 
          error_message: errorMessage,
          progress: 0
        })
        .eq('id', videoId);
        
      toast.error(`Video generation failed: ${errorMessage}`);
    } catch (error) {
      console.error(`[VideoStatusManager] Error handling video failure:`, error);
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
    
    // This calls the same central processing function as the automatic poller,
    // ensuring the backend route is always used for completed videos.
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