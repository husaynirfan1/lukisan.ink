import { supabase } from './supabase';
import { enhancedVideoProcessor, VideoProcessingProgress } from './enhancedVideoProcessor';
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
  private monitoringVideos: Set<string> = new Set();

  private constructor() {}

  static getInstance(): VideoStatusManager {
    if (!VideoStatusManager.instance) {
      VideoStatusManager.instance = new VideoStatusManager();
    }
    return VideoStatusManager.instance;
  }

  /**
   * Start monitoring a video using the enhanced processor
   */
  startMonitoring(videoId: string, taskId: string, userId: string): void {
    if (this.monitoringVideos.has(videoId)) {
      console.log(`[VideoStatusManager] Already monitoring video ${videoId}`);
      return;
    }

    console.log(`[VideoStatusManager] Starting enhanced monitoring for video ${videoId}, task ${taskId}`);
    this.monitoringVideos.add(videoId);

    // Use the enhanced video processor
    enhancedVideoProcessor.processVideo(
      taskId,
      videoId,
      userId,
      (progress: VideoProcessingProgress) => {
        console.log(`[VideoStatusManager] Progress update for ${videoId}:`, progress);
        
        // Show toast notifications for key milestones
        if (progress.stage === 'completed') {
          toast.success('Video generation completed and saved to library!');
          this.monitoringVideos.delete(videoId);
        } else if (progress.stage === 'failed') {
          toast.error(`Video generation failed: ${progress.message}`);
          this.monitoringVideos.delete(videoId);
        }
      }
    ).then((result) => {
      console.log(`[VideoStatusManager] Processing completed for video ${videoId}:`, result);
      this.monitoringVideos.delete(videoId);
      
      if (result.success) {
        console.log(`[VideoStatusManager] Video ${videoId} successfully processed and stored`);
      } else {
        console.error(`[VideoStatusManager] Video ${videoId} processing failed:`, result.error);
      }
    }).catch((error) => {
      console.error(`[VideoStatusManager] Unexpected error processing video ${videoId}:`, error);
      this.monitoringVideos.delete(videoId);
      toast.error(`Video processing failed: ${error.message}`);
    });
  }

  /**
   * Stop monitoring a specific video
   */
  stopMonitoring(videoId: string): void {
    if (this.monitoringVideos.has(videoId)) {
      enhancedVideoProcessor.stopProcessing(videoId);
      this.monitoringVideos.delete(videoId);
      console.log(`[VideoStatusManager] Stopped monitoring video ${videoId}`);
    }
  }

  /**
   * Manual status check using the enhanced processor
   */
  async manualStatusCheck(videoId: string, taskId: string, userId: string): Promise<void> {
    console.log(`[VideoStatusManager] Manual status check triggered for video ${videoId}`);
    
    // Stop any existing monitoring for this video
    this.stopMonitoring(videoId);
    
    // Start fresh monitoring
    this.startMonitoring(videoId, taskId, userId);
  }

  /**
   * Update video status in database (legacy method for compatibility)
   */
  async updateVideoStatus(videoId: string, updates: Partial<VideoStatusUpdate>): Promise<void> {
    try {
      const updateData: any = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('video_generations')
        .update(updateData)
        .eq('id', videoId);

      if (error) {
        console.error('[VideoStatusManager] Error updating video status:', error);
        throw error;
      }

      console.log('[VideoStatusManager] Video status updated successfully');
    } catch (error) {
      console.error('[VideoStatusManager] Failed to update video status:', error);
      throw error;
    }
  }

  /**
   * Mark video as completed (legacy method for compatibility)
   */
  async markVideoCompleted(
    videoId: string,
    videoUrl: string,
    storagePath: string,
    fileSize: number,
    integrityVerified: boolean = true
  ): Promise<void> {
    await this.updateVideoStatus(videoId, {
      status: 'completed',
      progress: 100,
      video_url: videoUrl,
      // Note: These fields might not exist in the current schema
      // storage_path: storagePath,
      // file_size: fileSize,
      // integrity_verified: integrityVerified
    });
  }

  /**
   * Mark video as failed (legacy method for compatibility)
   */
  async markVideoFailed(videoId: string, errorMessage: string): Promise<void> {
    await this.updateVideoStatus(videoId, {
      status: 'failed',
      error: errorMessage,
      progress: 0
    });
  }

  /**
   * Get monitoring status for debugging
   */
  getMonitoringStatus(): { activeVideos: string[], totalActive: number } {
    const processorStatus = enhancedVideoProcessor.getProcessingStatus();
    
    return {
      activeVideos: Array.from(this.monitoringVideos),
      totalActive: this.monitoringVideos.size
    };
  }

  /**
   * Stop all monitoring
   */
  stopAllMonitoring(): void {
    console.log('[VideoStatusManager] Stopping all monitoring');
    
    // Stop enhanced processor
    enhancedVideoProcessor.stopAllProcessing();
    
    // Clear our tracking
    this.monitoringVideos.clear();
  }
}

export const videoStatusManager = VideoStatusManager.getInstance();