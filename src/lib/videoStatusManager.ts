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

  private constructor() {}

  static getInstance(): VideoStatusManager {
    if (!VideoStatusManager.instance) {
      VideoStatusManager.instance = new VideoStatusManager();
    }
    return VideoStatusManager.instance;
  }

  startMonitoring(videoId: string, taskId: string, userId: string): void {
    if (this.pollingIntervals.has(videoId)) {
      return; // Already monitoring
    }

    const interval = setInterval(async () => {
      await this.checkAndProcessVideoStatus(videoId, taskId, userId);
    }, 10000); // Check every 10 seconds

    this.pollingIntervals.set(videoId, interval);
    this.checkAndProcessVideoStatus(videoId, taskId, userId); // Initial check
  }

  stopMonitoring(videoId: string): void {
    const interval = this.pollingIntervals.get(videoId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(videoId);
    }
  }
  
  private async checkAndProcessVideoStatus(videoId: string, taskId: string, userId: string): Promise<void> {
    try {
      const statusResponse = await checkVideoStatus(taskId);

      if (statusResponse.status === 'completed' && statusResponse.video_url) {
        // Stop polling this task as it's completed
        this.stopMonitoring(videoId);
        // Delegate the complex work to the backend
        await this.handleVideoCompletionOnBackend(videoId, statusResponse.video_url, userId, taskId);
      } else if (statusResponse.status === 'failed') {
        this.stopMonitoring(videoId);
        await this.handleVideoFailure(videoId, statusResponse.error || 'Unknown error');
      }
      // For other statuses, the frontend will just reflect it. Polling continues.

    } catch (error: any) {
      console.error(`[VideoStatusManager] Error checking status for video ${videoId}:`, error);
      // Optional: Stop polling after too many errors
      this.stopMonitoring(videoId);
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

      console.log(`[VideoStatusManager] Backend successfully processed video ${videoId}`);
      toast.success('Video processing complete and saved to your library!');
      // The frontend will update automatically via the realtime subscription.

    } catch (error) {
      console.error(`[VideoStatusManager] Error notifying backend:`, error);
      toast.error('Failed to save completed video to library.');
      // Update the status to 'failed' in the DB so it doesn't get stuck
      await this.handleVideoFailure(videoId, 'Failed to save to library');
    }
  }

  private async handleVideoFailure(videoId: string, errorMessage: string): Promise<void> {
    try {
      await supabase
        .from('video_generations')
        .update({ status: 'failed', error_message: errorMessage })
        .eq('id', videoId);
        
      toast.error(`Video generation failed: ${errorMessage}`);
    } catch (error) {
      console.error(`[VideoStatusManager] Error handling video failure:`, error);
    }
  }

  /**
   * --- ADDED THIS METHOD TO FIX THE ERROR ---
   * Manually triggers a status check for a specific video.
   * This function is called by the "Re-check Status" button in the UI.
   */
  async manualStatusCheck(videoId: string, taskId: string, userId: string): Promise<void> {
    console.log(`[VideoStatusManager] Manual status check triggered for video ${videoId}`);
    // This calls the same central processing function as the automatic poller,
    // ensuring the backend route is always used for completed videos.
    await this.checkAndProcessVideoStatus(videoId, taskId, userId);
  }
}

export const videoStatusManager = VideoStatusManager.getInstance();
