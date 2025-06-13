import { supabase } from './supabase'; // Assuming this is your regular client-side Supabase client instance
import { checkVideoStatus, VideoStatusPoller, showVideoCompleteNotification } from './piapi';
import toast from 'react-hot-toast';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// !! URGENT SECURITY CONCERN !!
// If this code runs in the browser, exposing SUPABASE_SERVICE_KEY is a severe security vulnerability.
// This key grants full admin access to your database.
// All sensitive database operations (like updates via service_role key) should go through a Supabase Edge Function
// or leverage Row Level Security (RLS) with the regular client-side supabase client.
const supabaseAdmin: SupabaseClient = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY as string
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
  logo_url: string | null; // Corrected to logo_url based on your database schema
  error_message: string | null;
  updated_at: string;
}

class VideoProcessingService {
  private activeTasks = new Map<string, VideoProcessingTask>();
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds

  /**
   * Initiates the processing workflow for a video task.
   * @param taskId PiAPI's task ID.
   * @param videoDbId The UUID of the video record in your Supabase 'video_generations' table.
   * @param userId The ID of the user who owns the video.
   */
  startProcessing(taskId: string, videoDbId: string, userId: string): void {
    console.log(`[VideoProcessor] Starting processing for task: ${taskId}`);

    // Stop any existing processing for this task to prevent duplicates
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

  /**
   * Stops processing for a given task ID.
   * @param taskId PiAPI's task ID.
   */
  stopProcessing(taskId: string): void {
    const task = this.activeTasks.get(taskId);
    if (task?.poller) {
      task.poller.stop();
    }
    this.activeTasks.delete(taskId);
    console.log(`[VideoProcessor] Stopped processing for task: ${taskId}`);
  }

  /**
   * Main workflow for processing a video task.
   * @param task The video processing task object.
   */
  private async processVideoWorkflow(task: VideoProcessingTask): Promise<void> {
    try {
      console.log(`[VideoProcessor] Processing workflow for task: ${task.taskId} (attempt ${task.retryCount + 1}/${task.maxRetries + 1})`);

      const PIAPI_API_KEY = import.meta.env.VITE_PIAPI_API_KEY;
      if (!PIAPI_API_KEY || PIAPI_API_KEY === 'your_piapi_api_key_here') {
        throw new Error('PiAPI key not configured. Please add your API key to the .env file.');
      }

      // 1. Fetch current video status from DB to get the latest state including video_url and logo_url
      const { data: currentVideos, error: fetchError } = await supabase
        .from('video_generations')
        .select('id, video_id, status, progress, storage_path, video_url, logo_url, error_message, updated_at') // Corrected to logo_url
        .eq('id', task.videoDbId)
        .single();

      if (fetchError || !currentVideos) {
          console.error(`[VideoProcessor] Failed to fetch current video record ${task.videoDbId}:`, fetchError?.message || 'Not found');
          throw new Error(`Failed to fetch video record for workflow: ${fetchError?.message || 'Not found'}`);
      }
      const currentVideoRecord: VideoRecord = currentVideos as VideoRecord;
      console.log(`[VideoProcessor] Initial DB record for task ${task.taskId}:`, currentVideoRecord);

      // Check PiAPI status directly (this function is external, assumed to be in piapi.ts)
      const initialPiApiStatus = await checkVideoStatus(task.taskId);
      console.log(`[VideoProcessor] Initial PiAPI status for task ${task.taskId}:`, initialPiApiStatus);

      let videoUrlToUseForInitialUpdate: string | null = currentVideoRecord.video_url;
      let logoUrlToUseForInitialUpdate: string | null = currentVideoRecord.logo_url; // Corrected to logo_url

      if (initialPiApiStatus.status === 'completed' && initialPiApiStatus.video_url) {
        videoUrlToUseForInitialUpdate = initialPiApiStatus.video_url;
        logoUrlToUseForInitialUpdate = initialPiApiStatus.thumbnail_url || null; // PiAPI provides thumbnail_url, map to logo_url
      } else if (['failed', 'error', 'cancelled'].includes(initialPiApiStatus.status)) {
        videoUrlToUseForInitialUpdate = null;
        logoUrlToUseForInitialUpdate = null; // Clear logo_url on failure
      }

      // Update database with this *current* PiAPI status and any existing valid URLs from DB
      await this.updateVideoStatus(
        task.videoDbId,
        initialPiApiStatus.status,
        initialPiApiStatus.progress || 0,
        null, // No error message for initial update from PiAPI
        videoUrlToUseForInitialUpdate, // Pass the determined video URL
        logoUrlToUseForInitialUpdate // Pass the determined logo URL
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

  /**
   * Handles errors that occur during the video processing workflow, implementing retry logic.
   * @param task The video processing task object.
   * @param error The error object.
   */
  private async handleWorkflowError(task: VideoProcessingTask, error: any): Promise<void> {
    const errorMessage = error.message || 'Unknown error';

    // Fetch current record to determine existing URLs before setting to 'failed'
    const { data: currentRecord } = await supabase
      .from('video_generations')
      .select('video_url, logo_url') // Corrected to logo_url
      .eq('id', task.videoDbId)
      .single();

    // Specific error handling for known PiAPI issues
    if (errorMessage.includes('failed to find task')) {
      console.error(`[VideoProcessor] Task not found on PiAPI: ${task.taskId}`);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, 'Video generation task not found on PiAPI. The task may have expired or was never created.', null, null);
      this.activeTasks.delete(task.taskId);
      toast.error('Video generation failed: Task not found on PiAPI');
      return;
    }

    if (errorMessage.includes('insufficient credits')) {
      console.error(`[VideoProcessor] Insufficient credits for task: ${task.taskId}`);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, 'Insufficient credits on PiAPI account. Please top up your credits.', null, null);
      this.activeTasks.delete(task.taskId);
      toast.error('Video generation failed: Insufficient PiAPI credits. Please check your account balance.');
      return;
    }

    if (errorMessage.includes('PiAPI key not configured')) {
      console.error(`[VideoProcessor] PiAPI key not configured`);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, 'PiAPI key not configured. Please add your API key to enable video generation.', null, null);
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
      // On max retries, set status to failed and explicitly nullify video_url and logo_url
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, `Video generation failed after ${task.maxRetries} retries: ${errorMessage}`, null, null);
      this.activeTasks.delete(task.taskId);
      toast.error(`Video generation failed after ${task.maxRetries} retries`);
    }
  }

  /**
   * Handles status updates received from the PiAPI poller.
   * @param task The video processing task object.
   * @param piapiStatus The status object received from PiAPI.
   */
  private async handleStatusUpdate(task: VideoProcessingTask, piapiStatus: any): Promise<void> {
    console.log(`[VideoProcessor] Status update for task ${task.taskId} from PiAPI:`, piapiStatus);

    try {
      // Fetch current video record from DB to get the latest video_url and logo_url
      const { data: currentRecord } = await supabase
        .from('video_generations')
        .select('video_url, logo_url') // Corrected to logo_url
        .eq('id', task.videoDbId)
        .single();

      let videoUrlToUpdate: string | null = currentRecord?.video_url || null;
      let logoUrlToUpdate: string | null = currentRecord?.logo_url || null; // Corrected to logo_url

      // If PiAPI's new status is 'completed' and it has a URL, use it.
      if (piapiStatus.status === 'completed' && piapiStatus.video_url) {
        videoUrlToUpdate = piapiStatus.video_url;
        logoUrlToUpdate = piapiStatus.thumbnail_url || null; // PiAPI gives thumbnail_url, map to logo_url
      } else if (['failed', 'error', 'cancelled'].includes(piapiStatus.status)) {
        videoUrlToUpdate = null;
        logoUrlToUpdate = null; // Clear logo_url on failure
      }

      await this.updateVideoStatus(
        task.videoDbId,
        piapiStatus.status,
        piapiStatus.progress || 0,
        piapiStatus.error_message, // Pass error message from PiAPI if any
        videoUrlToUpdate, // Pass the determined video URL
        logoUrlToUpdate // Pass the determined logo URL
      );

    } catch (error) {
      console.error(`[VideoProcessor] Error updating status for task ${task.taskId}:`, error);
    }
  }

  /**
   * Handles the completion of a video task as reported by the poller.
   * @param task The video processing task object.
   * @param piapiStatus The final status object received from PiAPI.
   */
  private async handleCompletion(task: VideoProcessingTask, piapiStatus: any): Promise<void> {
    console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}) reported as completed by poller with video_url: ${piapiStatus.video_url}`);

    try {
      // Call our Edge Function `force-check-status` to get the *definitive* status and URL from the DB.
      // This function will download the video from PiAPI, upload to Supabase Storage, and update DB.
      const videoConfirmationResult = await this.downloadAndStoreVideo(piapiStatus.video_url, task.taskId, task.userId, task.videoDbId);

      if (videoConfirmationResult && videoConfirmationResult.new_status === 'pending_url') {
        console.warn(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}): Edge Function confirmed status as 'pending_url'. PiAPI might have been temporarily inconsistent.`);
        await this.updateVideoStatus(
          task.videoDbId,
          'pending_url',
          95,
          videoConfirmationResult.error_message || 'Awaiting final video URL.',
          videoConfirmationResult.final_video_url, // Pass the final_video_url received from EF
          videoConfirmationResult.final_logo_url // Pass the final_logo_url received from EF
        );
      } else if (videoConfirmationResult && videoConfirmationResult.new_status === 'completed' && videoConfirmationResult.final_video_url) {
        console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}): Edge Function confirmed 'completed' status with URL: ${videoConfirmationResult.final_video_url}`);
        await this.updateVideoStatus(
          task.videoDbId,
          'completed',
          100,
          null, // Clear error message on successful completion
          videoConfirmationResult.final_video_url, // Pass the final_video_url received from EF
          videoConfirmationResult.final_logo_url // Pass the final_logo_url received from EF
        );

        toast.success('Video generation completed successfully!');
        showVideoCompleteNotification(`Video for task ${task.taskId}`, () => {
          window.history.pushState({ tab: 'video-library' }, '', '/dashboard/video-library');
          window.dispatchEvent(new PopStateEvent('popstate', { state: { tab: 'video-library' } }));
        });
      } else {
        // This case implies an unexpected result from downloadAndStoreVideo (e.g., null, or unexpected status)
        console.error(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}): Failed to get definitive completed status or video URL from Edge Function. Result:`, videoConfirmationResult);
        throw new Error('Failed to confirm video status or retrieve video URL via Edge Function.');
      }

    } catch (error: any) {
      console.error(`[VideoProcessor] Error handling completion for task ${task.taskId} (DB ID: ${task.videoDbId}):`, error.message);
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, `Failed to process completed video: ${error.message}`, null, null); // Nullify URLs on client-side failure to finalize
      toast.error('Video generation completed but failed to finalize and save.');
    } finally {
      this.activeTasks.delete(task.taskId);
      console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}) removed from active processing by VideoProcessingService.`);
    }
  }

  /**
   * Handles errors reported by the poller for a specific task.
   * @param task The video processing task object.
   * @param error The error string from the poller.
   */
  private async handleError(task: VideoProcessingTask, error: string): Promise<void> {
    console.error(`[VideoProcessor] Task error from poller for ${task.taskId} (DB ID: ${task.videoDbId}): ${error}`);

    try {
      // When an error occurs and we're setting status to 'failed', explicitly nullify video_url and logo_url
      await this.updateVideoStatus(task.videoDbId, 'failed', 0, error, null, null);
      toast.error(`Video generation failed: ${error}`);
    } catch (updateError) {
      console.error(`[VideoProcessor] Error updating failed status for task ${task.taskId} (DB ID: ${task.videoDbId}):`, updateError);
    } finally {
      this.activeTasks.delete(task.taskId);
      console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}) removed from active processing due to error.`);
    }
  }

  /**
   * Updates the video status and related fields in the Supabase database.
   * This is a central function for all DB updates from VideoProcessingService.
   * @param videoDbId The database ID of the video record.
   * @param status The new status for the video.
   * @param progress The new progress percentage.
   * @param errorMsg An optional error message to store.
   * @param newVideoUrl An optional new video URL to set (can be null to clear).
   * @param newLogoUrl An optional new logo URL to set (can be null to clear).
   */
  private async updateVideoStatus(
    videoDbId: string,
    status: string,
    progress: number,
    errorMsg: string | null = null,
    newVideoUrl?: string | null,
    newLogoUrl?: string | null // Changed newThumbnailUrl to newLogoUrl
  ): Promise<void> {

    // Fetch the current state of the record from DB to ensure we don't accidentally clear an existing valid URL/logo_url
    const { data: currentRecord, error: fetchError } = await supabase
        .from('video_generations')
        .select('video_url, logo_url, status, progress, error_message') // Corrected to logo_url
        .eq('id', videoDbId)
        .single();

    if (fetchError) {
        console.error(`[VideoProcessor] CRITICAL: Error fetching current record for ${videoDbId} before update:`, fetchError.message);
        throw new Error(`Failed to read current video state before update: ${fetchError.message}`);
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Only add fields to updateData if they are actually changing or being explicitly set.

    // Status logic:
    if (status !== currentRecord?.status) {
        updateData.status = status;
    }
    // Progress logic:
    const roundedProgress = Math.max(0, Math.min(100, Math.round(progress)));
    if (roundedProgress !== currentRecord?.progress) {
        updateData.progress = roundedProgress;
    }

    // Video URL logic:
    if (newVideoUrl !== undefined) { // If newVideoUrl param was explicitly provided (even as null)
        if (newVideoUrl !== currentRecord?.video_url) {
            updateData.video_url = newVideoUrl;
            // Consider if storage_path needs to be updated here too, if it's tied to video_url
            // updateData.storage_path = newVideoUrl;
        }
    } else { // If newVideoUrl param was UNDEFINED (not provided by caller)
        // Carry over the existing video_url from the DB, unless status is changing to 'failed'
        if (currentRecord?.video_url && status !== 'failed') {
            updateData.video_url = currentRecord.video_url;
            // updateData.storage_path = currentRecord.storage_path;
        } else if (status === 'completed' && !currentRecord?.video_url) {
            // This is a critical state - attempting to mark as completed without a URL from DB.
            // This path should ideally not be hit if EF already set status to 'pending_url'.
            console.error(`[VideoProcessor] ALERT: Attempting to mark video ${videoDbId} as 'completed' without a video_url, even though currentRecord has none. This will likely cause a constraint violation.`);
        }
    }

    // Logo URL logic (corrected from thumbnail_url):
    if (newLogoUrl !== undefined) { // If newLogoUrl param was explicitly provided (even as null)
        if (newLogoUrl !== currentRecord?.logo_url) {
            updateData.logo_url = newLogoUrl;
        }
    } else { // If newLogoUrl param was UNDEFINED (not provided by caller)
        // Carry over the existing logo_url from the DB, unless status is changing to 'failed'
        if (currentRecord?.logo_url && status !== 'failed') {
            updateData.logo_url = currentRecord.logo_url;
        }
    }

    // Error message logic:
    if (errorMsg !== currentRecord?.error_message) {
        updateData.error_message = errorMsg;
    }

    // Determine if there are any meaningful changes (excluding updated_at)
    let hasMeaningfulChanges = false;
    for (const key in updateData) {
        if (key !== 'updated_at') {
            const oldValue = currentRecord?.[key as keyof VideoRecord];
            const newValue = updateData[key];

            // Compare for changes, handling null/undefined consistency
            if (oldValue !== newValue) {
                // If a value is changing from null/undefined to a non-null value, it's a change
                if ((oldValue === null || oldValue === undefined) && (newValue !== null && newValue !== undefined)) {
                    hasMeaningfulChanges = true;
                    break;
                }
                // If a value is changing from a value to null/undefined, it's a change
                else if ((oldValue !== null && oldValue !== undefined) && (newValue === null || newValue === undefined)) {
                    hasMeaningfulChanges = true;
                    break;
                }
                // If a value is changing between two non-null/undefined values, it's a change
                else if (oldValue !== null && oldValue !== undefined && newValue !== null && newValue !== undefined && oldValue !== newValue) {
                    hasMeaningfulChanges = true;
                    break;
                }
            }
        }
    }

    // Special case: if status itself is changing, it's always a meaningful change
    if (updateData.status && updateData.status !== currentRecord?.status) {
        hasMeaningfulChanges = true;
    }
    // Also consider progress changes as meaningful
    if (updateData.progress !== undefined && updateData.progress !== currentRecord?.progress) {
        hasMeaningfulChanges = true;
    }


    console.log(`[VideoProcessor] Updating DB for ${videoDbId} (DB ID) with payload:`, updateData);
    console.log(`[VideoProcessor] (Pre-update values for comparison: status=${currentRecord?.status}, progress=${currentRecord?.progress}, video_url=${currentRecord?.video_url || 'null'}, logo_url=${currentRecord?.logo_url || 'null'})`);


    if (hasMeaningfulChanges) {
      const { error: updateError } = await supabaseAdmin
        .from('video_generations')
        .update(updateData)
        .eq('id', videoDbId);

      if (updateError) {
        console.error(`[VideoProcessor] Database update error for video ${videoDbId} (DB ID):`, updateError.message);
        throw updateError;
      }
      console.log(`[VideoProcessor] Successfully updated DB for video ${videoDbId} (DB ID) to status: ${status}`);
    } else {
      console.log(`[VideoProcessor] No meaningful changes detected for video.id ${videoDbId}. Skipping DB update.`);
    }
  }

/**
 * Calls the Supabase Edge Function to confirm video status, download from PiAPI,
 * upload to Supabase Storage, and update the database.
 * @param videoUrlFromPoller The video URL received directly from the PiAPI poller (for logging/comparison).
 * @param piApiTaskId The task ID from PiAPI.
 * @param userId The user ID associated with the video.
 * @param videoDbId The database ID of the video record.
 * @returns A promise resolving to an object with new_status, final_video_url, etc., or null if unsuccessful.
 */
private async downloadAndStoreVideo(
  videoUrlFromPoller: string,
  piApiTaskId: string,
  userId: string,
  videoDbId: string
): Promise<{ new_status: string; final_video_url?: string; final_logo_url?: string; error_message?: string } | null> {
  try {
    console.log(`[VideoProcessor] Confirming status via 'force-check-status' for PiAPI Task ID: ${piApiTaskId} (DB ID: ${videoDbId}). URL from poller: ${videoUrlFromPoller}`);

    // Invoke the Edge Function. The 'data' property in the response object
    // will contain the raw JSON string returned by the Edge Function.
    const { data: rawEdgeFunctionResponseData, error: efError } = await supabase.functions.invoke('force-check-status', {
      body: {
        video_id: videoDbId,
      },
    });

    if (efError) {
      console.error(`[VideoProcessor] Edge function 'force-check-status' error for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}):`, efError.message);
      throw new Error(`Edge function call failed for ${piApiTaskId}: ${efError.message}`);
    }

    let edgeFunctionResponse: any;
    if (rawEdgeFunctionResponseData) {
        try {
            // CRITICAL FIX: Parse the JSON string from the 'data' property
            edgeFunctionResponse = JSON.parse(rawEdgeFunctionResponseData);
        } catch (parseError: any) {
            console.error(`[VideoProcessor] Edge function 'force-check-status' returned malformed JSON:`, rawEdgeFunctionResponseData, `Parse error:`, parseError);
            throw new Error(`Edge function returned malformed JSON response for ${piApiTaskId}.`);
        }
    } else {
        console.error(`[VideoProcessor] Edge function 'force-check-status' returned NO DATA (empty or null body) for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}).`);
        throw new Error(`Edge function returned empty response for ${piApiTaskId}.`);
    }

    // Now, edgeFunctionResponse is the actual parsed JSON object
    console.log(`[VideoProcessor] Parsed EF response after JSON.parse:`, edgeFunctionResponse);


    // Destructure expected fields directly from the parsed edgeFunctionResponse.
    // PiAPI returns 'thumbnail_url', which we map to 'final_logo_url' in our DB.
    const { new_status, video_url: final_video_url_from_ef, error_message, task_id: ef_piapi_task_id, thumbnail_url: final_logo_url_from_ef } = edgeFunctionResponse;

    if (ef_piapi_task_id && ef_piapi_task_id !== piApiTaskId) {
        console.warn(`[VideoProcessor] Mismatch in PiAPI task ID. Expected ${piApiTaskId}, Edge Function responded for ${ef_piapi_task_id} (DB ID ${videoDbId}). Proceeding with EF data.`);
    }

    if (new_status === 'pending_url') {
      console.warn(`[VideoProcessor] Edge function reported 'pending_url' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}). Final URL from EF: ${final_video_url_from_ef}. Logo from EF: ${final_logo_url_from_ef}`);
      return { new_status: 'pending_url', final_video_url: final_video_url_from_ef, error_message: error_message || 'Video URL is pending confirmation.', final_logo_url: final_logo_url_from_ef };
    }

    if (new_status === 'completed' && final_video_url_from_ef) {
      console.log(`[VideoProcessor] Edge function reported 'completed' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}) with video URL: ${final_video_url_from_ef}. Logo: ${final_logo_url_from_ef}`);
      return { new_status: 'completed', final_video_url: final_video_url_from_ef, error_message, final_logo_url: final_logo_url_from_ef };
    }

    if (new_status === 'failed') {
       console.error(`[VideoProcessor] Edge function reported 'failed' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}). Error: ${error_message}`);
       throw new Error(error_message || `Video processing failed as reported by status check for ${piApiTaskId}.`);
    }

    // This block should ideally not be hit if the EF always returns one of the above statuses.
    console.error(`[VideoProcessor] Edge function 'force-check-status' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}) returned unhandled status/URL combination: Status='${new_status}', URL='${final_video_url_from_ef}'. Error message: '${error_message}'`);
    throw new Error(`Edge function returned unexpected state ('${new_status}') or missing URL for ${piApiTaskId}.`);

  } catch (err: any) {
    console.error(`[VideoProcessor] Error in downloadAndStoreVideo (confirming status via Edge Function) for PiAPI Task ${piApiTaskId} (DB ID ${videoDbId}):`, err.message);
    throw err;
  }
}
  /**
   * Returns a list of active task IDs for debugging purposes.
   * @returns An array of active task IDs.
   */
  getActiveTasks(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  /**
   * Checks if a specific task is currently being processed.
   * @param taskId PiAPI's task ID.
   * @returns True if the task is active, false otherwise.
   */
  isProcessing(taskId: string): boolean {
    return this.activeTasks.has(taskId);
  }
}

export const videoProcessingService = new VideoProcessingService();
