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

        // --- FINAL FIX for [object Object] error ---
        // Robustly extract the error message for the toast notification.
        let errorMessage = 'An unknown error occurred';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (typeof error === 'object' && error !== null && 'message' in error) {
            errorMessage = String(error.message);
        }
        
        toast.error(`Video generation failed: ${errorMessage}`);
        // --- End of Final Fix ---
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
}

export const videoStatusManager = VideoStatusManager.getInstance();