import { supabase } from './supabase';
import { checkVideoStatus } from './piapi';
import toast from 'react-hot-toast';

export interface VideoStatusCheckResult {
  success: boolean;
  videoId: string;
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

/**
 * Utility class for checking video status directly from PiAPI
 * and updating the database with the latest status
 */
export class VideoStatusChecker {
  private static instance: VideoStatusChecker;
  private checkingVideos: Set<string> = new Set();

  private constructor() {}

  static getInstance(): VideoStatusChecker {
    if (!VideoStatusChecker.instance) {
      VideoStatusChecker.instance = new VideoStatusChecker();
    }
    return VideoStatusChecker.instance;
  }

  /**
   * Check the status of a video directly from PiAPI
   * and update the database with the latest status
   */
  async checkVideoStatus(videoId: string): Promise<VideoStatusCheckResult> {
    if (this.checkingVideos.has(videoId)) {
      return {
        success: false,
        videoId,
        taskId: '',
        status: 'processing',
        progress: 0,
        error: 'Status check already in progress'
      };
    }

    this.checkingVideos.add(videoId);
    console.log(`[VideoStatusChecker] Checking status for video ${videoId}`);

    try {
      // 1. Get the video from the database
      const { data: video, error: fetchError } = await supabase
        .from('video_generations')
        .select('*')
        .eq('id', videoId)
        .single();

      if (fetchError || !video) {
        throw new Error(fetchError?.message || 'Video not found');
      }

      const taskId = video.video_id;
      console.log(`[VideoStatusChecker] Found task ID: ${taskId}`);

      // 2. Check the status from PiAPI
      const statusResponse = await checkVideoStatus(taskId);
      console.log(`[VideoStatusChecker] Status response:`, statusResponse);

      // 3. Update the database with the latest status
      const updateData: any = {
        status: statusResponse.status,
        progress: statusResponse.progress || 0,
        updated_at: new Date().toISOString()
      };

      // Add video URL if available
      if (statusResponse.video_url) {
        updateData.video_url = statusResponse.video_url;
      }

      // Add thumbnail URL if available
      if (statusResponse.thumbnail_url) {
        updateData.thumbnail_url = statusResponse.thumbnail_url;
      }

      // Add error message if available
      if (statusResponse.error) {
        updateData.error_message = statusResponse.error;
      }

      const { error: updateError } = await supabase
        .from('video_generations')
        .update(updateData)
        .eq('id', videoId);

      if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      console.log(`[VideoStatusChecker] Updated database for video ${videoId}`);

      return {
        success: true,
        videoId,
        taskId,
        status: statusResponse.status,
        progress: statusResponse.progress || 0,
        videoUrl: statusResponse.video_url,
        thumbnailUrl: statusResponse.thumbnail_url,
        error: statusResponse.error
      };

    } catch (error: any) {
      console.error(`[VideoStatusChecker] Error checking status:`, error);
      return {
        success: false,
        videoId,
        taskId: '',
        status: 'failed',
        progress: 0,
        error: error.message || 'Unknown error'
      };
    } finally {
      this.checkingVideos.delete(videoId);
    }
  }

  /**
   * Check the status of multiple videos in parallel
   */
  async checkMultipleVideos(videoIds: string[]): Promise<VideoStatusCheckResult[]> {
    console.log(`[VideoStatusChecker] Checking status for ${videoIds.length} videos`);
    
    // Process in batches to avoid overwhelming the API
    const batchSize = 3;
    const results: VideoStatusCheckResult[] = [];
    
    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize);
      console.log(`[VideoStatusChecker] Processing batch ${i / batchSize + 1}: ${batch.length} videos`);
      
      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(videoId => this.checkVideoStatus(videoId))
      );
      
      results.push(...batchResults);
      
      // Add a small delay between batches
      if (i + batchSize < videoIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Check if a video is currently being checked
   */
  isChecking(videoId: string): boolean {
    return this.checkingVideos.has(videoId);
  }

  /**
   * Get the number of videos currently being checked
   */
  getCheckingCount(): number {
    return this.checkingVideos.size;
  }

  /**
   * Get the list of videos currently being checked
   */
  getCheckingVideos(): string[] {
    return Array.from(this.checkingVideos);
  }
}

export const videoStatusChecker = VideoStatusChecker.getInstance();