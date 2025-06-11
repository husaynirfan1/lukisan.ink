import { supabase } from './supabase';
import { checkVideoStatus, type TaskStatusResponse } from './piapi';

export interface VideoStatusUpdate {
  videoId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  videoUrl?: string;
  error?: string;
}

export interface VideoMonitoringService {
  startMonitoring: (videoId: string, taskId: string, userId: string) => void;
  stopMonitoring: (videoId: string) => void;
  manualStatusCheck: (videoId: string, taskId: string, userId: string) => Promise<void>;
  onStatusUpdate: (callback: (update: VideoStatusUpdate) => void) => void;
}

class VideoStatusManager implements VideoMonitoringService {
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private statusCallbacks: ((update: VideoStatusUpdate) => void)[] = [];

  onStatusUpdate(callback: (update: VideoStatusUpdate) => void): void {
    this.statusCallbacks.push(callback);
  }

  private notifyStatusUpdate(update: VideoStatusUpdate): void {
    this.statusCallbacks.forEach(callback => callback(update));
  }

  startMonitoring(videoId: string, taskId: string, userId: string): void {
    console.log(`Starting monitoring for video ${videoId}, task ${taskId}`);
    
    // Clear any existing monitoring for this video
    this.stopMonitoring(videoId);

    // Start polling every 10 seconds
    const interval = setInterval(async () => {
      try {
        await this.checkAndProcessVideoStatus(videoId, taskId, userId);
      } catch (error) {
        console.error(`Error monitoring video ${videoId}:`, error);
        
        // Notify of error but continue monitoring
        this.notifyStatusUpdate({
          videoId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 10000); // 10 seconds

    this.monitoringIntervals.set(videoId, interval);
  }

  stopMonitoring(videoId: string): void {
    const interval = this.monitoringIntervals.get(videoId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(videoId);
      console.log(`Stopped monitoring for video ${videoId}`);
    }
  }

  async manualStatusCheck(videoId: string, taskId: string, userId: string): Promise<void> {
    console.log(`Manual status check for video ${videoId}, task ${taskId}`);
    
    try {
      await this.checkAndProcessVideoStatus(videoId, taskId, userId);
    } catch (error) {
      console.error(`Manual status check failed for video ${videoId}:`, error);
      
      this.notifyStatusUpdate({
        videoId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Manual check failed'
      });
      
      throw error;
    }
  }

  private async checkAndProcessVideoStatus(videoId: string, taskId: string, userId: string): Promise<void> {
    try {
      // Check status with PiAPI
      const statusResponse = await checkVideoStatus(taskId);
      
      console.log(`Status check for video ${videoId}:`, statusResponse);

      // Update local database with current status
      await this.updateVideoStatus(videoId, statusResponse);

      // Notify UI of status update
      this.notifyStatusUpdate({
        videoId,
        status: statusResponse.status,
        progress: statusResponse.progress,
        videoUrl: statusResponse.video_url,
        error: statusResponse.error
      });

      // If completed, process the video through backend
      if (statusResponse.status === 'completed' && statusResponse.video_url) {
        console.log(`Video ${videoId} completed, processing through backend`);
        
        await this.handleVideoCompletionOnBackend(
          videoId, 
          statusResponse.video_url, 
          userId, 
          taskId
        );
        
        // Stop monitoring this video
        this.stopMonitoring(videoId);
      } else if (statusResponse.status === 'failed') {
        // Stop monitoring failed videos
        this.stopMonitoring(videoId);
      }

    } catch (error) {
      console.error(`Error checking status for video ${videoId}:`, error);
      throw error;
    }
  }

  private async updateVideoStatus(videoId: string, statusResponse: TaskStatusResponse): Promise<void> {
    try {
      const updateData: any = {
        status: statusResponse.status,
        updated_at: new Date().toISOString()
      };

      if (statusResponse.progress !== undefined) {
        updateData.progress = statusResponse.progress;
      }

      if (statusResponse.error) {
        updateData.error_message = statusResponse.error;
      }

      const { error } = await supabase
        .from('video_generations')
        .update(updateData)
        .eq('video_id', videoId);

      if (error) {
        console.error('Error updating video status in database:', error);
        throw new Error(`Database update failed: ${error.message}`);
      }

    } catch (error) {
      console.error('Error updating video status:', error);
      throw error;
    }
  }

  private async handleVideoCompletionOnBackend(
    videoId: string, 
    piapiVideoUrl: string, 
    userId: string, 
    taskId: string
  ): Promise<void> {
    try {
      console.log('Calling backend to process completed video:', videoId);

      // Get current session for authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Authentication required for video processing');
      }

      // Call the backend processing endpoint
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-video`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId,
          piapiVideoUrl,
          userId,
          taskId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Backend processing failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Backend processing successful:', result);

      // Notify UI that processing is complete
      this.notifyStatusUpdate({
        videoId,
        status: 'completed',
        videoUrl: result.videoUrl
      });

    } catch (error) {
      console.error('Error in backend video processing:', error);
      
      // Update database to reflect the error
      await supabase
        .from('video_generations')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Backend processing failed',
          updated_at: new Date().toISOString()
        })
        .eq('video_id', videoId);

      throw error;
    }
  }

  // Cleanup method to stop all monitoring
  cleanup(): void {
    this.monitoringIntervals.forEach((interval, videoId) => {
      clearInterval(interval);
      console.log(`Cleaned up monitoring for video ${videoId}`);
    });
    this.monitoringIntervals.clear();
    this.statusCallbacks.length = 0;
  }
}

// Export singleton instance
export const videoStatusManager = new VideoStatusManager();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    videoStatusManager.cleanup();
  });
}