import { supabase } from './supabase';
import { enhancedVideoProcessor } from './enhancedVideoProcessor';
import toast from 'react-hot-toast';

export class VideoStatusManager {
  private static instance: VideoStatusManager;
  private monitoringVideos: Set<string> = new Set();

  private constructor() {}

  static getInstance(): VideoStatusManager {
    if (!VideoStatusManager.instance) {
      VideoStatusManager.instance = new VideoStatusManager();
    }
    return VideoStatusManager.instance;
  }

  public startMonitoring(videoId: string, taskId: string, userId: string): void {
    if (this.monitoringVideos.has(videoId)) {
      return; // Already monitoring, do nothing.
    }

    console.log(`[Manager] Starting monitoring for video ${videoId}, task ${taskId}`);
    this.monitoringVideos.add(videoId);

    // Call the processor but don't await it. Handle success/failure in the .catch block.
    // This prevents an unhandled promise rejection from crashing the app.
    enhancedVideoProcessor.processVideo(taskId, videoId, userId)
      .catch(error => {
        console.error(`[Manager] Final processing error for video ${videoId}:`, error);
        toast.error(`Video failed: ${error.message || 'An unknown error occurred'}`);
      })
      .finally(() => {
        // Once processing is complete (success or fail), remove it from the active set.
        this.monitoringVideos.delete(videoId);
        console.log(`[Manager] Monitoring finished for video ${videoId}.`);
      });
  }

  public stopMonitoring(videoId: string): void {
    if (this.monitoringVideos.has(videoId)) {
      enhancedVideoProcessor.stopProcessing(videoId);
      this.monitoringVideos.delete(videoId);
      console.log(`[Manager] Stopped monitoring video ${videoId}`);
    }
  }

  public getMonitoringStatus(): { activeVideos: string[] } {
    return {
      activeVideos: Array.from(this.monitoringVideos),
    };
  }

  // Manual status check method for UI buttons
  public async manualStatusCheck(videoId: string, taskId: string, userId: string): Promise<void> {
    console.log(`[Manager] Manual status check triggered for video ${videoId}`);
    
    // This calls the same central processing function as the automatic poller
    try {
      await enhancedVideoProcessor.processVideo(taskId, videoId, userId);
    } catch (error: any) {
      console.error(`[Manager] Manual status check failed for video ${videoId}:`, error);
      throw error; // Re-throw so the UI can handle it
    }
  }
}

export const videoStatusManager = VideoStatusManager.getInstance();