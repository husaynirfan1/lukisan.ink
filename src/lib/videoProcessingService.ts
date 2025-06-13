import { supabase } from './supabase'; // Assuming this is your regular client-side Supabase client
import { checkVideoStatus, VideoStatusPoller, showVideoCompleteNotification } from './piapi';
import toast from 'react-hot-toast';
import { createClient } from '@supabase/supabase-js';

// !! URGENT SECURITY CONCERN !!
// If this code runs in the browser, exposing SUPABASE_SERVICE_KEY is a severe security vulnerability.
// This key grants full admin access to your database.
// All sensitive database operations (like updates via service_role key) should go through a Supabase Edge Function
// or leverage Row Level Security (RLS) with the regular client-side supabase client.
// For the purpose of fixing the current bug, I'll proceed, but please prioritize this.
const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL as string, // Added as string assertion
  import.meta.env.VITE_SUPABASE_SERVICE_KEY as string // Added as string assertion
);

interface VideoProcessingTask {
  taskId: string;
  videoDbId: string;
  userId: string;
  poller?: VideoStatusPoller;
  retryCount: number;
  maxRetries: number;
}

// Interface to represent the full video data from the database
interface VideoRecord {
  id: string;
  video_id: string; // PiAPI task ID
  status: string;
  progress: number;
  storage_path: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  // Add other relevant fields if they exist in your 'video_generations' table
  error_message: string | null;
  updated_at: string;
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

      const PIAPI_API_KEY = import.meta.env.VITE_PIAPI_API_KEY;
      if (!PIAPI_API_KEY || PIAPI_API_KEY === 'your_piapi_api_key_here') {
        throw new Error('PiAPI key not configured. Please add your API key to the .env file.');
      }

      // 1. Fetch current video status from DB to get the latest state including video_url
      const { data: currentVideos, error: fetchError } = await supabase
        .from('video_generations')
        .select('*') // Select all columns to get video_url, thumbnail_url, etc.
        .eq('id', task.videoDbId)
        .single(); // Use .single() to get one record or null

      if (fetchError || !currentVideos) {
          console.error(`[VideoProcessor] Failed to fetch current video record ${task.videoDbId}:`, fetchError?.message || 'Not found');
          throw new Error(`Failed to fetch video record for workflow: ${fetchError?.message || 'Not found'}`);
      }
      const currentVideoRecord: VideoRecord = currentVideos; // Cast to our interface
      console.log(`[VideoProcessor] Initial DB record for task ${task.taskId}:`, currentVideoRecord);


      // The "Initial status for task" log (line 64) needs to reflect PiAPI's status, not DB's
      // The poller should fetch PiAPI's status. Let's make sure that's clear.
      // The `checkVideoStatus` function called here should directly query PiAPI
      // This line is outside the class, so we assume it uses the regular PiAPI key.
      const initialPiApiStatus = await checkVideoStatus(task.taskId); // This function is in piapi.ts
      console.log(`[VideoProcessor] Initial PiAPI status for task ${task.taskId}:`, initialPiApiStatus);
      
      // Update database with this *current* PiAPI status and any existing valid URLs from DB
      await this.updateVideoStatus(
        task.videoDbId,
        initialPiApiStatus.status,
        initialPiApiStatus.progress || 0,
        null, // No error on initial update
        currentVideoRecord.video_url // Pass existing video_url from DB
      );

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
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, 'Video generation task not found on PiAPI. The task may have expired or was never created.', null); // Pass null for video_url
      this.activeTasks.delete(task.taskId);
      toast.error('Video generation failed: Task not found on PiAPI');
      return;
    }

    if (errorMessage.includes('insufficient credits')) {
      console.error(`[VideoProcessor] Insufficient credits for task: ${task.taskId}`);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, 'Insufficient credits on PiAPI account. Please top up your credits.', null); // Pass null for video_url
      this.activeTasks.delete(task.taskId);
      toast.error('Video generation failed: Insufficient PiAPI credits. Please check your account balance.');
      return;
    }

    if (errorMessage.includes('PiAPI key not configured')) {
      console.error(`[VideoProcessor] PiAPI key not configured`);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, 'PiAPI key not configured. Please add your API key to enable video generation.', null); // Pass null for video_url
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
      // Ensure video_url is explicitly nullified on final failure if it exists from previous attempts
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, `Video generation failed after ${task.maxRetries} retries: ${errorMessage}`, null); // Pass null for video_url
      this.activeTasks.delete(task.taskId);
      toast.error(`Video generation failed after ${task.maxRetries} retries`);
    }
  }

  // status parameter here is from piapi.ts poller (TaskStatusResponse)
  private async handleStatusUpdate(task: VideoProcessingTask, piapiStatus: any) {
    console.log(`[VideoProcessor] Status update for task ${task.taskId} from PiAPI:`, piapiStatus);

    try {
      // Fetch current video record from DB to get the latest video_url and other fields
      const { data: currentVideos, error: fetchError } = await supabase
        .from('video_generations')
        .select('video_url, thumbnail_url, status') // Only fetch needed fields
        .eq('id', task.videoDbId)
        .single();

      if (fetchError || !currentVideos) {
          console.error(`[VideoProcessor] Failed to fetch current video record ${task.videoDbId} for status update:`, fetchError?.message || 'Not found');
          // Decide if this should throw or just log. For now, log and return to avoid breaking poller.
          return;
      }
      const currentVideoRecord: Pick<VideoRecord, 'video_url' | 'thumbnail_url' | 'status'> = currentVideos;


      // If PiAPI's new status is 'completed' and it has a URL, update it.
      // Otherwise, only update progress and status, preserving existing video_url if any.
      let videoUrlToUpdate: string | null | undefined = currentVideoRecord.video_url; // Default to existing DB URL
      let thumbnailUrlToUpdate: string | null | undefined = currentVideoRecord.thumbnail_url; // Default to existing DB thumbnail

      if (piapiStatus.status === 'completed' && piapiStatus.video_url) {
        videoUrlToUpdate = piapiStatus.video_url;
        thumbnailUrlToUpdate = piapiStatus.thumbnail_url;
      } else if (piapiStatus.status === 'failed' || piapiStatus.status === 'error') {
        // If PiAPI explicitly failed, clear the URLs in DB unless they are from storage
        // This is a design choice. For now, let's nullify on failure.
        videoUrlToUpdate = null;
        thumbnailUrlToUpdate = null;
      }

      await this.updateVideoStatus(
        task.videoDbId,
        piapiStatus.status,
        piapiStatus.progress || 0,
        piapiStatus.error_message, // Pass error message from PiAPI if any
        videoUrlToUpdate // Pass the determined video URL
      );

    } catch (error) {
      console.error(`[VideoProcessor] Error updating status for task ${task.taskId}:`, error);
    }
  }

  private async handleCompletion(task: VideoProcessingTask, piapiStatus: any) { // status is TaskStatusResponse from piapi.ts poller
    console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}) reported as completed by poller with video_url: ${piapiStatus.video_url}`);

    try {
      // The poller in piapi.ts ensures piapiStatus.video_url is present when calling onComplete.
      // Call our Edge Function `force-check-status` to get the *definitive* status and URL from the DB.
      const videoConfirmationResult = await this.downloadAndStoreVideo(piapiStatus.video_url, task.taskId, task.userId, task.videoDbId);

      if (videoConfirmationResult && videoConfirmationResult.new_status === 'pending_url') {
        console.warn(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}): Edge Function confirmed status as 'pending_url'. PiAPI might have been temporarily inconsistent.`);
        // Pass the final_video_url received from EF, even if it's null/undefined for 'pending_url'
        await this.updateVideoStatus(task.videoDbId, 'pending_url', 95, videoConfirmationResult.error_message || 'Awaiting final video URL.', videoConfirmationResult.final_video_url);
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
      // Ensure video_url is nullified on client-side failure to finalize
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, `Failed to process completed video: ${error.message}`, null);
      toast.error('Video generation completed but failed to finalize and save.');
    } finally {
      this.activeTasks.delete(task.taskId);
      console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}) removed from active processing by VideoProcessingService.`);
    }
  }

  private async handleError(task: VideoProcessingTask, error: string) {
    console.error(`[VideoProcessor] Task error from poller for ${task.taskId} (DB ID: ${task.videoDbId}): ${error}`);

    try {
      // When an error occurs and we're setting status to 'failed', explicitly nullify video_url in DB
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, error, null);
      toast.error(`Video generation failed: ${error}`);
    } catch (updateError) {
      console.error(`[VideoProcessor] Error updating failed status for task ${task.taskId} (DB ID: ${task.videoDbId}):`, updateError);
    } finally {
      this.activeTasks.delete(task.taskId);
      console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}) removed from active processing due to error.`);
    }
  }

  // Refactored to ensure video_url is always handled correctly
  private async updateVideoStatus(videoDbId: string, status: string, progress: number, errorMsg: string | null = null, newVideoUrl?: string | null, newThumbnailUrl?: string | null) {

    // First, fetch the current state of the record from DB to ensure we don't accidentally clear an existing valid URL
    const { data: currentRecord, error: fetchError } = await supabase
        .from('video_generations')
        .select('video_url, thumbnail_url')
        .eq('id', videoDbId)
        .single();

    if (fetchError) {
        console.error(`[VideoProcessor] Error fetching current record for ${videoDbId} before update:`, fetchError.message);
        // Decide how to handle this critical error. For now, rethrow or log and continue.
        // For robustness, if we can't read, we might want to just proceed with what we have
        // but it's risky. Let's assume we proceed.
    }

    const updateData: Record<string, any> = {
      status,
      progress: Math.max(0, Math.min(100, Math.round(progress))),
      updated_at: new Date().toISOString(),
      error_message: errorMsg, // errorMsg is already null or string
    };

    // Logic for video_url:
    // 1. If a newVideoUrl is explicitly provided (not undefined), use it (even if null).
    // 2. Otherwise, if the status is 'completed' and there's no newVideoUrl,
    //    it means we must rely on the existing URL from the DB.
    // 3. For 'failed' status, explicitly nullify unless you have a specific reason to keep.
    // 4. For other statuses, carry over the existing URL from the DB.

    if (newVideoUrl !== undefined) { // If it's explicitly provided (can be null)
      updateData.video_url = newVideoUrl;
      // updateData.storage_path = newVideoUrl; // Keep this consistent if storage_path is meant to be the URL
    } else if (currentRecord?.video_url) { // If no new URL, but one exists in the DB, carry it over
      updateData.video_url = currentRecord.video_url;
    }
    // If newVideoUrl is undefined AND no currentRecord.video_url, then video_url will not be added to updateData,
    // which means it won't be updated in DB (will keep its current value, potentially null).

    // Logic for thumbnail_url:
    if (newThumbnailUrl !== undefined) { // If explicitly provided
      updateData.thumbnail_url = newThumbnailUrl;
    } else if (currentRecord?.thumbnail_url) { // If no new thumbnail, but one exists, carry it over
      updateData.thumbnail_url = currentRecord.thumbnail_url;
    }


    console.log(`[VideoProcessor] Updating DB for ${videoDbId} (DB ID): status=${status}, progress=${updateData.progress}, video_url=${updateData.video_url === undefined ? 'not sent (will keep current DB value)' : updateData.video_url}, error_msg=${updateData.error_message}`);

    const { error: updateError } = await supabaseAdmin // Use supabaseAdmin for service role updates
      .from('video_generations')
      .update(updateData)
      .eq('id', videoDbId);

    if (updateError) {
      console.error(`[VideoProcessor] Database update error for video ${videoDbId} (DB ID):`, updateError.message);
      // It's important to throw the updateError here so it's caught by the calling handle* methods
      // and can initiate retry or failure flows.
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
        throw new Error(`Edge function call failed for ${piApiTaskId}: ${efError.message}`);
      }

      if (!efData) {
        console.error(`[VideoProcessor] Edge function 'force-check-status' returned no data for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}).`);
        throw new Error(`Edge function returned empty response for ${piApiTaskId}.`);
      }

      // Log the raw response from Edge Function for debugging.
      console.log(`[VideoProcessor] Raw Edge function 'force-check-status' response for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}):`, efData);

      // Destructure expected fields from the Edge Function's response.
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
