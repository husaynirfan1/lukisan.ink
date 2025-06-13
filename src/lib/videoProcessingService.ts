import { supabase } from './supabase';
import { checkVideoStatus, VideoStatusPoller, showVideoCompleteNotification } from './piapi';
import toast from 'react-hot-toast';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY
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

  private async handleCompletion(task: VideoProcessingTask, status: any) { // status is TaskStatusResponse from piapi.ts poller
    console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}) reported as completed by poller with video_url: ${status.video_url}`);
    
    try {
      // The poller in piapi.ts ensures status.video_url is present when calling onComplete.
      // We must call our Edge Function `force-check-status` via `downloadAndStoreVideo` (which should be renamed)
      // to get the *definitive* status and URL from the DB.
      const videoConfirmationResult = await this.downloadAndStoreVideo(status.video_url, task.taskId, task.userId, task.videoDbId);

      if (videoConfirmationResult && videoConfirmationResult.new_status === 'pending_url') {
        console.warn(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}): Edge Function confirmed status as 'pending_url'. PiAPI might have been temporarily inconsistent.`);
        await this.updateVideoStatus(task.videoDbId, 'pending_url', 95, videoConfirmationResult.error_message || 'Awaiting final video URL.');
        // Do not show completion toast. Polling responsibility is with piapi.ts poller now.
      } else if (videoConfirmationResult && videoConfirmationResult.new_status === 'completed' && videoConfirmationResult.final_video_url) {
        console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}): Edge Function confirmed 'completed' status with URL: ${videoConfirmationResult.final_video_url}`);
        await this.updateVideoStatus(task.videoDbId, 'completed', 100, null, videoConfirmationResult.final_video_url);

        toast.success('Video generation completed successfully!');
        showVideoCompleteNotification(`Video for task ${task.taskId}`, () => { // Consider using a more descriptive title if available
          window.history.pushState({ tab: 'video-library' }, '', '/dashboard/video-library');
          window.dispatchEvent(new PopStateEvent('popstate', { state: { tab: 'video-library' } }));
        });
      } else {
        // This case implies an unexpected result from downloadAndStoreVideo (e.g. null, or unexpected status)
        console.error(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}): Failed to get definitive completed status or video URL from Edge Function. Result:`, videoConfirmationResult);
        throw new Error('Failed to confirm video status or retrieve video URL via Edge Function.');
      }
      
    } catch (error: any) {
      console.error(`[VideoProcessor] Error handling completion for task ${task.taskId} (DB ID: ${task.videoDbId}):`, error.message);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, `Failed to process completed video: ${error.message}`);
      toast.error('Video generation completed but failed to finalize and save.');
    } finally {
      // VideoProcessingService's direct oversight for this task (via this specific poller instance) is done.
      // If status became 'pending_url', the piapi.ts poller (if it re-reads DB status or re-checks API) should continue.
      this.activeTasks.delete(task.taskId);
      console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}) removed from active processing by VideoProcessingService.`);
    }
  }

  private async handleError(task: VideoProcessingTask, error: string) {
    console.error(`[VideoProcessor] Task error from poller for ${task.taskId} (DB ID: ${task.videoDbId}): ${error}`);
    
    try {
      // Try to get current progress if poller is active, otherwise set to 0
      const currentProgress = task.poller?.isActive() ? (await checkVideoStatus(task.taskId)).progress || 0 : 0;
      await this.updateVideoStatus(task.videoDbId, 'failed', currentProgress, error);
      toast.error(`Video generation failed: ${error}`);
    } catch (updateError) {
      console.error(`[VideoProcessor] Error updating failed status for task ${task.taskId} (DB ID: ${task.videoDbId}):`, updateError);
    } finally {
      this.activeTasks.delete(task.taskId);
      console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}) removed from active processing due to error.`);
    }
  }

  private async updateVideoStatus(videoDbId: string, status: string, progress: number, error?: string | null, final_video_url?: string) {
    const updateData: any = {
      status,
      progress: Math.max(0, Math.min(100, Math.round(progress))), // Ensure progress is rounded and within 0-100
      updated_at: new Date().toISOString(),
      error_message: error === undefined ? null : error // Set error_message to null if error is undefined, otherwise use error value
    };
    
    if (final_video_url) {
      // This is the URL confirmed by the Edge Function (could be PiAPI's or a Supabase storage URL)
      updateData.video_url = final_video_url;
      // If we have a convention to also populate storage_path, do it here.
      // For now, video_url is the primary field for the confirmed usable URL.
      updateData.storage_path = final_video_url;
    } else if (status !== 'pending_url' && status !== 'completed') {
      // If the status is not one that implies a URL is coming or present (e.g. failed, processing, pending),
      // we might want to nullify video_url if no final_video_url is provided in this update.
      // This prevents an old/stale URL from persisting if the task fails or resets.
      // However, the Edge Function `force-check-status` is the primary source of truth for `video_url` consistency.
      // This client-side update should be careful not to wrongly clear a `video_url`
      // that the Edge function decided to keep for 'pending_url'.
      // So, only clear it if `final_video_url` is explicitly passed as `null` (not `undefined`).
      // For now, if `final_video_url` is not provided, we simply don't add `video_url` to `updateData`,
      // unless we explicitly want to clear it.
      // Let's only set video_url if final_video_url is truthy.
      // If status moves to 'failed', 'pending', 'processing', the Edge Function should handle clearing invalid URLs.
    }


    console.log(`[VideoProcessor] Updating DB for ${videoDbId} (DB ID): status=${status}, progress=${updateData.progress}, video_url=${final_video_url || 'not set'}, error_msg=${updateData.error_message}`);

    const { error: updateError } = await supabaseAdmin // Use supabaseAdmin for service role updates
      .from('video_generations')
      .update(updateData)
      .eq('id', videoDbId);
    
    if (updateError) {
      console.error(`[VideoProcessor] Database update error for video ${videoDbId} (DB ID):`, updateError.message);
      throw updateError;
    }
    console.log(`[VideoProcessor] Successfully updated DB for video ${videoDbId} (DB ID) to status: ${status}`);
  }

// Renamed parameters for clarity and added videoDbId
// The main purpose of this function is now to confirm status and URL via Edge Function.
private async downloadAndStoreVideo(
  videoUrlFromPoller: string, // This is the URL from piapi.ts poller's direct check. Can be used for logging/comparison.
  piApiTaskId: string,      // This is task_id from PiAPI (e.g., "task_xyz123")
  userId: string,           // User ID associated with the video
  videoDbId: string         // This is the `id` (UUID) from our `video_generations` table
): Promise<{ new_status: string; final_video_url?: string; error_message?: string } | null> {
  try {
    console.log(`[VideoProcessor] Confirming status via 'force-check-status' for PiAPI Task ID: ${piApiTaskId} (DB ID: ${videoDbId}). URL from poller: ${videoUrlFromPoller}`);

    // `videoDbId` is the database row ID, which `force-check-status` expects as `video_id`.
    const { data: efData, error: efError } = await supabase.functions.invoke('force-check-status', {
      body: {
        video_id: videoDbId,
        // Optional: pass piApiTaskId for logging within the Edge Function, if it's designed to use it.
        // current_piapi_task_id: piApiTaskId
      },
    });

    if (efError) {
      console.error(`[VideoProcessor] Edge function 'force-check-status' error for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}):`, efError.message);
      // It's important to throw an error that will be caught by handleCompletion and set status to 'failed'
      throw new Error(`Edge function call failed for ${piApiTaskId}: ${efError.message}`);
    }

    if (!efData) {
      console.error(`[VideoProcessor] Edge function 'force-check-status' returned no data for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}).`);
      throw new Error(`Edge function returned empty response for ${piApiTaskId}.`);
    }

    // Log the raw response from Edge Function for debugging.
    console.log(`[VideoProcessor] Raw Edge function 'force-check-status' response for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}):`, efData);

    // Destructure expected fields from the Edge Function's response.
    // Response: { message, video_id (db_id), task_id (piAPI), old_status, new_status, old_progress, new_progress, video_url, thumbnail_url, updated, error_message? }
    const { new_status, video_url: final_video_url_from_ef, error_message, task_id: ef_piapi_task_id } = efData;

    // Sanity check: ensure the task_id from EF matches our current piApiTaskId (if EF returns it)
    if (ef_piapi_task_id && ef_piapi_task_id !== piApiTaskId) {
        console.warn(`[VideoProcessor] Mismatch in PiAPI task ID. Expected ${piApiTaskId}, Edge Function responded for ${ef_piapi_task_id} (DB ID ${videoDbId}). Proceeding with EF data.`);
    }

    if (new_status === 'pending_url') { // `final_video_url_from_ef` might be null/undefined here
      console.warn(`[VideoProcessor] Edge function reported 'pending_url' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}). Final URL from EF: ${final_video_url_from_ef}`);
      return { new_status: 'pending_url', final_video_url: final_video_url_from_ef, error_message: error_message || 'Video URL is pending confirmation.' };
    }

    if (new_status === 'completed' && final_video_url_from_ef) {
      console.log(`[VideoProcessor] Edge function reported 'completed' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}) with video URL: ${final_video_url_from_ef}`);
      return { new_status: 'completed', final_video_url: final_video_url_from_ef, error_message };
    }

    if (new_status === 'failed') {
       console.error(`[VideoProcessor] Edge function reported 'failed' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}). Error: ${error_message}`);
       throw new Error(error_message || `Video processing failed as reported by status check for ${piApiTaskId}.`);
    }

    // Fallback for any other status or unexpected combination from Edge Function (e.g., 'completed' but no URL)
    console.error(`[VideoProcessor] Edge function 'force-check-status' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}) returned unhandled status/URL combination: Status='${new_status}', URL='${final_video_url_from_ef}'. Error message: '${error_message}'`);
    throw new Error(`Edge function returned unexpected state ('${new_status}') or missing URL for ${piApiTaskId}.`);

  } catch (err: any) {
    // Log the error before rethrowing it to be caught by handleCompletion's catch block
    console.error(`[VideoProcessor] Error in downloadAndStoreVideo (confirming status via Edge Function) for PiAPI Task ${piApiTaskId} (DB ID ${videoDbId}):`, err.message);
    throw err;
  }
}
  // Public method to get active tasks (for debugging)
  getActiveTasks(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  // Public method to check if a task is being processed
  isProcessing(taskId: string): boolean {
    return this.activeTasks.has(taskId);
  }
}

export const videoProcessingService = new VideoProcessingService();