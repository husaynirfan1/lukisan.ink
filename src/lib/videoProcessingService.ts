import { supabase } from './supabase';
import { checkVideoStatus, VideoStatusPoller, showVideoCompleteNotification } from './piapi';
import toast from 'react-hot-toast';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_KEY || import.meta.env.VITE_SUPABASE_SERVICE_KEY
);

interface VideoProcessingTask {
  taskId: string;
  videoDbId: string;
  userId: string;
  poller?: VideoStatusPoller;
  retryCount: number;
  maxRetries: number;
}

class VideoProcessingService {
  private activeTasks = new Map<string, VideoProcessingTask>();
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds

  startProcessing(taskId: string, videoDbId: string, userId: string) {
    console.log(`[VideoProcessor] Starting processing for task: ${taskId}`);
    
    // Stop any existing processing for this task
    this.stopProcessing(taskId);
    
    const task: VideoProcessingTask = {
      taskId,
      videoDbId,
      userId,
      retryCount: 0,
      maxRetries: this.MAX_RETRIES
    };
    
    this.activeTasks.set(taskId, task);
    this.processVideoWorkflow(task);
  }

  stopProcessing(taskId: string) {
    const task = this.activeTasks.get(taskId);
    if (task?.poller) {
      task.poller.stop();
    }
    this.activeTasks.delete(taskId);
    console.log(`[VideoProcessor] Stopped processing for task: ${taskId}`);
  }

  private async processVideoWorkflow(task: VideoProcessingTask) {
    try {
      console.log(`[VideoProcessor] Processing workflow for task: ${task.taskId} (attempt ${task.retryCount + 1}/${task.maxRetries + 1})`);
      
      // Check if PiAPI is available
      const PIAPI_API_KEY = import.meta.env.VITE_PIAPI_API_KEY;
      if (!PIAPI_API_KEY || PIAPI_API_KEY === 'your_piapi_api_key_here') {
        throw new Error('PiAPI key not configured. Please add your API key to the .env file.');
      }

      // Initial status check to validate task exists
      const initialStatus = await checkVideoStatus(task.taskId);
      console.log(`[VideoProcessor] Initial status for task ${task.taskId}:`, initialStatus);
      
      // Update database with initial status
      await this.updateVideoStatus(task.videoDbId, initialStatus.status, initialStatus.progress || 0);
      
      // Start polling for status updates
      const poller = new VideoStatusPoller(
        task.taskId,
        (status) => this.handleStatusUpdate(task, status),
        (status) => this.handleCompletion(task, status),
        (error) => this.handleError(task, error)
      );
      
      task.poller = poller;
      poller.start();
      
    } catch (error: any) {
      console.error(`[VideoProcessor] Error in workflow (attempt ${task.retryCount + 1}):`, error);
      await this.handleWorkflowError(task, error);
    }
  }

  private async handleWorkflowError(task: VideoProcessingTask, error: any) {
    const errorMessage = error.message || 'Unknown error';
    
    // Handle specific error types
    if (errorMessage.includes('failed to find task')) {
      console.error(`[VideoProcessor] Task not found on PiAPI: ${task.taskId}`);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, 'Video generation task not found on PiAPI. The task may have expired or was never created.');
      this.activeTasks.delete(task.taskId);
      toast.error('Video generation failed: Task not found on PiAPI');
      return;
    }
    
    if (errorMessage.includes('insufficient credits')) {
      console.error(`[VideoProcessor] Insufficient credits for task: ${task.taskId}`);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, 'Insufficient credits on PiAPI account. Please top up your credits.');
      this.activeTasks.delete(task.taskId);
      toast.error('Video generation failed: Insufficient PiAPI credits. Please check your account balance.');
      return;
    }
    
    if (errorMessage.includes('PiAPI key not configured')) {
      console.error(`[VideoProcessor] PiAPI key not configured`);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, 'PiAPI key not configured. Please add your API key to enable video generation.');
      this.activeTasks.delete(task.taskId);
      toast.error('Video generation failed: PiAPI key not configured');
      return;
    }
    
    // For other errors, implement retry logic
    task.retryCount++;
    
    if (task.retryCount <= task.maxRetries) {
      console.log(`[VideoProcessor] Retrying task ${task.taskId} in ${this.RETRY_DELAY}ms (attempt ${task.retryCount}/${task.maxRetries})`);
      
      setTimeout(() => {
        if (this.activeTasks.has(task.taskId)) {
          this.processVideoWorkflow(task);
        }
      }, this.RETRY_DELAY);
    } else {
      console.error(`[VideoProcessor] Max retries exceeded for task: ${task.taskId}`);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, `Video generation failed after ${task.maxRetries} retries: ${errorMessage}`);
      this.activeTasks.delete(task.taskId);
      toast.error(`Video generation failed after ${task.maxRetries} retries`);
    }
  }

  private async handleStatusUpdate(task: VideoProcessingTask, status: any) {
    console.log(`[VideoProcessor] Status update for task ${task.taskId}:`, status);
    
    try {
      await this.updateVideoStatus(task.videoDbId, status.status, status.progress || 0);
    } catch (error) {
      console.error(`[VideoProcessor] Error updating status for task ${task.taskId}:`, error);
    }
  }

  private async handleCompletion(task: VideoProcessingTask, status: any) {
    console.log(`[VideoProcessor] Task completed: ${task.taskId}`);
    
    try {
      if (!status.video_url) {
        throw new Error('No video URL provided in completion status');
      }
      
      // Download and store the video
      const storagePath = await this.downloadAndStoreVideo(status.video_url, task.taskId, task.userId);
      
      // Update database with completion status and storage path
      await this.updateVideoStatus(task.videoDbId, 'completed', 100, null, storagePath);
      
      // Show notification
      showVideoCompleteNotification(`Video ${task.taskId}`, () => {
        // Navigate to video library
        window.history.pushState({ tab: 'video-library' }, '', '/dashboard/video-library');
        window.dispatchEvent(new PopStateEvent('popstate', { state: { tab: 'video-library' } }));
      });
      
      toast.success('Video generation completed successfully!');
      
    } catch (error: any) {
      console.error(`[VideoProcessor] Error handling completion for task ${task.taskId}:`, error);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, `Failed to process completed video: ${error.message}`);
      toast.error('Video generation completed but failed to save');
    } finally {
      this.activeTasks.delete(task.taskId);
    }
  }

  private async handleError(task: VideoProcessingTask, error: string) {
    console.error(`[VideoProcessor] Task error: ${task.taskId} - ${error}`);
    
    try {
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, error);
      toast.error(`Video generation failed: ${error}`);
    } catch (updateError) {
      console.error(`[VideoProcessor] Error updating failed status for task ${task.taskId}:`, updateError);
    } finally {
      this.activeTasks.delete(task.taskId);
    }
  }

  private async updateVideoStatus(videoDbId: string, status: string, progress: number, error?: string | null, storagePath?: string) {
    const updateData: any = {
      status,
      progress,
      updated_at: new Date().toISOString()
    };
    
    if (error !== undefined) {
      updateData.error_message = error;
    }
    
    if (storagePath) {
      updateData.storage_path = storagePath;
    }
    
    const { error: updateError } = await supabase
      .from('video_generations')
      .update(updateData)
      .eq('id', videoDbId);
    
    if (updateError) {
      console.error(`[VideoProcessor] Database update error for video ${videoDbId}:`, updateError);
      throw updateError;
    }
  }

private async downloadAndStoreVideo(videoUrl: string, taskId: string, userId: string): Promise<string> {
  try {
    console.log(`[VideoProcessor] Invoking edge function to store video for task: ${taskId}`);

    const { data, error } = await supabase.functions.invoke('force-check-status', {
      body: {
        task_id: taskId,
        user_id: userId,
        db_id: taskId, // or use actual video DB row ID if available
      },
    });

    if (error) {
      console.error('[VideoProcessor] Edge function error:', error);
      throw new Error(`Edge function failed: ${error.message}`);
    }

    if (!data?.video_url) {
      throw new Error(`Edge function returned no video URL for task ${taskId}`);
    }

    console.log(`[VideoProcessor] Video stored and URL received: ${data.video_url}`);
    return data.video_url;
  } catch (err: any) {
    console.error('[VideoProcessor] Error calling edge function:', err);
    throw err;
  }
};

export const videoProcessingService = new VideoProcessingService();