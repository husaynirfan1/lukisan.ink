import { supabase } from './supabase'; // Assuming this is your regular client-side Supabase client
import { checkVideoStatus, VideoStatusPoller, showVideoCompleteNotification } from './piapi';
import toast from 'react-hot-toast';
import { createClient } from '@supabase/supabase-js';

// !! URGENT SECURITY CONCERN !!
// If this code runs in the browser, exposing SUPABASE_SERVICE_KEY is a severe security vulnerability.
// This key grants full admin admin access to your database.
// All sensitive database operations (like updates via service_role key) should go through a Supabase Edge Function
// or leverage Row Level Security (RLS) with the regular client-side supabase client.
// For the purpose of fixing the current bug, I'll proceed, but please prioritize this.
const supabaseAdmin = createClient(
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
  logo_url: string | null; // Changed from thumbnail_url to logo_url
  error_message: string | null;
  updated_at: string;
}

class VideoProcessingService {
  private activeTasks = new Map<string, VideoProcessingTask>();
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds

  startProcessing(taskId: string, videoDbId: string, userId: string) {
    console.log(`[VideoProcessor] Starting processing for task: ${taskId}`);

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

      // 1. Fetch current video status from DB to get the latest state including video_url and logo_url
      const { data: currentVideos, error: fetchError } = await supabase
        .from('video_generations')
        .select('id, video_id, status, progress, storage_path, video_url, logo_url, error_message, updated_at') // Changed thumbnail_url to logo_url
        .eq('id', task.videoDbId)
        .single();

      if (fetchError || !currentVideos) {
          console.error(`[VideoProcessor] Failed to fetch current video record ${task.videoDbId}:`, fetchError?.message || 'Not found');
          throw new Error(`Failed to fetch video record for workflow: ${fetchError?.message || 'Not found'}`);
      }
      const currentVideoRecord: VideoRecord = currentVideos as VideoRecord;
      console.log(`[VideoProcessor] Initial DB record for task ${task.taskId}:`, currentVideoRecord);


      // The `checkVideoStatus` function (from piapi.ts) should directly query PiAPI
      const initialPiApiStatus = await checkVideoStatus(task.taskId);
      console.log(`[VideoProcessor] Initial PiAPI status for task ${task.taskId}:`, initialPiApiStatus);

      let videoUrlToUseForInitialUpdate = currentVideoRecord.video_url;
      let logoUrlToUseForInitialUpdate = currentVideoRecord.logo_url; // Use logo_url

      if (initialPiApiStatus.status === 'completed' && initialPiApiStatus.video_url) {
        videoUrlToUseForInitialUpdate = initialPiApiStatus.video_url;
        logoUrlToUseForInitialUpdate = initialPiApiStatus.thumbnail_url || null; // PiAPI gives thumbnail_url, map to logo_url
      } else if (['failed', 'error', 'cancelled'].includes(initialPiApiStatus.status)) {
        videoUrlToUseForInitialUpdate = null;
        logoUrlToUseForInitialUpdate = null; // Clear logo_url on failure
      }

      await this.updateVideoStatus(
        task.videoDbId,
        initialPiApiStatus.status,
        initialPiApiStatus.progress || 0,
        null, // No error on initial update
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

  private async handleWorkflowError(task: VideoProcessingTask, error: any) {
    const errorMessage = error.message || 'Unknown error';

    // Fetch current record to get existing video_url and logo_url before setting to 'failed'
    const { data: currentRecord } = await supabase
      .from('video_generations')
      .select('video_url, logo_url') // Changed thumbnail_url to logo_url
      .eq('id', task.videoDbId)
      .single();

    const existingVideoUrl = currentRecord?.video_url || null;
    const existingLogoUrl = currentRecord?.logo_url || null;


    // Handle specific error types
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

  // status parameter here is from piapi.ts poller (TaskStatusResponse)
  private async handleStatusUpdate(task: VideoProcessingTask, piapiStatus: any) {
    console.log(`[VideoProcessor] Status update for task ${task.taskId} from PiAPI:`, piapiStatus);

    try {
      // Fetch current video record from DB to get the latest video_url and logo_url
      const { data: currentRecord } = await supabase
        .from('video_generations')
        .select('video_url, logo_url') // Changed thumbnail_url to logo_url
        .eq('id', task.videoDbId)
        .single();

      let videoUrlToUpdate: string | null | undefined = currentRecord?.video_url || null;
      let logoUrlToUpdate: string | null | undefined = currentRecord?.logo_url || null;

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

  private async handleCompletion(task: VideoProcessingTask, piapiStatus: any) {
    console.log(`[VideoProcessor] Task ${task.taskId} (DB ID: ${task.videoDbId}) reported as completed by poller with video_url: ${piapiStatus.video_url}`);

    try {
      // Call our Edge Function `force-check-status` to get the *definitive* status and URL from the DB.
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

  private async handleError(task: VideoProcessingTask, error: string) {
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

  // Refactored to ensure video_url and logo_url are always handled correctly
  private async updateVideoStatus(videoDbId: string, status: string, progress: number, errorMsg: string | null = null, newVideoUrl?: string | null, newLogoUrl?: string | null) { // Changed newThumbnailUrl to newLogoUrl

    const { data: currentRecord, error: fetchError } = await supabase
        .from('video_generations')
        .select('video_url, logo_url, status, progress, error_message') // Changed thumbnail_url to logo_url
        .eq('id', videoDbId)
        .single();

    if (fetchError) {
        console.error(`[VideoProcessor] CRITICAL: Error fetching current record for ${videoDbId} before update:`, fetchError.message);
        throw new Error(`Failed to read current video state before update: ${fetchError.message}`);
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

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
    if (newVideoUrl !== undefined) {
        if (newVideoUrl !== currentRecord?.video_url) {
            updateData.video_url = newVideoUrl;
        }
    } else {
        if (currentRecord?.video_url && status !== 'failed') {
            updateData.video_url = currentRecord.video_url;
        } else if (status === 'completed' && !currentRecord?.video_url) {
            console.error(`[VideoProcessor] ALERT: Attempting to mark video ${videoDbId} as 'completed' without a video_url, even though currentRecord has none. This will likely cause a constraint violation.`);
        }
    }

    // Logo URL logic (changed from thumbnail_url):
    if (newLogoUrl !== undefined) { // Check if parameter was explicitly provided
        if (newLogoUrl !== currentRecord?.logo_url) { // Compare with current logo_url
            updateData.logo_url = newLogoUrl; // Set logo_url
        }
    } else {
        if (currentRecord?.logo_url && status !== 'failed') { // Carry over existing logo_url unless failing
            updateData.logo_url = currentRecord.logo_url;
        }
    }


    // Error message logic:
    if (errorMsg !== currentRecord?.error_message) {
        updateData.error_message = errorMsg;
    }

    // Only proceed with update if there are meaningful changes
    let hasMeaningfulChanges = false;
    for (const key in updateData) {
        if (key !== 'updated_at' && updateData[key] !== currentRecord?.[key as keyof VideoRecord]) {
            hasMeaningfulChanges = true;
            break;
        }
    }
    // Explicitly check for video_url/logo_url being set from null to value (which is a meaningful change)
    if (currentRecord?.video_url === null && updateData.video_url !== undefined && updateData.video_url !== null) {
        hasMeaningfulChanges = true;
    }
    if (currentRecord?.logo_url === null && updateData.logo_url !== undefined && updateData.logo_url !== null) { // Changed thumbnail_url to logo_url
        hasMeaningfulChanges = true;
    }


    console.log(`[VideoProcessor] Updating DB for ${videoDbId} (DB ID) with payload:`, updateData);
    console.log(`[VideoProcessor] (Pre-update values for comparison: status=${currentRecord?.status}, progress=${currentRecord?.progress}, video_url=${currentRecord?.video_url || 'null'}, logo_url=${currentRecord?.logo_url || 'null'})`); // Changed thumbnail_url to logo_url


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

// The main purpose of this function is to confirm status and URL via Edge Function.
private async downloadAndStoreVideo(
  videoUrlFromPoller: string,
  piApiTaskId: string,
  userId: string,
  videoDbId: string
): Promise<{ new_status: string; final_video_url?: string; final_logo_url?: string; error_message?: string } | null> { // Changed final_thumbnail_url to final_logo_url
  try {
    console.log(`[VideoProcessor] Confirming status via 'force-check-status' for PiAPI Task ID: ${piApiTaskId} (DB ID: ${videoDbId}). URL from poller: ${videoUrlFromPoller}`);

    const { data: edgeFunctionResponse, error: efError } = await supabase.functions.invoke('force-check-status', {
      body: {
        video_id: videoDbId,
      },
    });
    console.log(`[VideoProcessor] RAW INVOKE RESPONSE OBJECT:`, { data: edgeFunctionResponse, error: efError });

    if (efError) {
      console.error(`[VideoProcessor] Edge function 'force-check-status' error for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}):`, efError.message);
      throw new Error(`Edge function call failed for ${piApiTaskId}: ${efError.message}`);
    }

    if (!edgeFunctionResponse) {
      console.error(`[VideoProcessor] Edge function 'force-check-status' returned NO DATA (empty or malformed JSON body) for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}).`);
      throw new Error(`Edge function returned empty or malformed response for ${piApiTaskId}.`);
    }

    console.log(`[VideoProcessor] Parsed EF response before destructuring:`, edgeFunctionResponse);


    // Destructure expected fields directly from edgeFunctionResponse. Changed thumbnail_url to logo_url
    const { new_status, video_url: final_video_url_from_ef, error_message, task_id: ef_piapi_task_id, thumbnail_url: final_logo_url_from_ef } = edgeFunctionResponse; // PiAPI returns thumbnail_url, mapping to final_logo_url

    if (ef_piapi_task_id && ef_piapi_task_id !== piApiTaskId) {
        console.warn(`[VideoProcessor] Mismatch in PiAPI task ID. Expected ${piApiTaskId}, Edge Function responded for ${ef_piapi_task_id} (DB ID ${videoDbId}). Proceeding with EF data.`);
    }

    if (new_status === 'pending_url') {
      console.warn(`[VideoProcessor] Edge function reported 'pending_url' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}). Final URL from EF: ${final_video_url_from_ef}. Logo from EF: ${final_logo_url_from_ef}`); // Changed Thumbnail to Logo
      return { new_status: 'pending_url', final_video_url: final_video_url_from_ef, error_message: error_message || 'Video URL is pending confirmation.', final_logo_url: final_logo_url_from_ef };
    }

    if (new_status === 'completed' && final_video_url_from_ef) {
      console.log(`[VideoProcessor] Edge function reported 'completed' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}) with video URL: ${final_video_url_from_ef}. Logo: ${final_logo_url_from_ef}`); // Changed Thumbnail to Logo
      return { new_status: 'completed', final_video_url: final_video_url_from_ef, error_message, final_logo_url: final_logo_url_from_ef };
    }

    if (new_status === 'failed') {
       console.error(`[VideoProcessor] Edge function reported 'failed' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}). Error: ${error_message}`);
       throw new Error(error_message || `Video processing failed as reported by status check for ${piApiTaskId}.`);
    }

    console.error(`[VideoProcessor] Edge function 'force-check-status' for DB ID ${videoDbId} (PiAPI Task ${piApiTaskId}) returned unhandled status/URL combination: Status='${new_status}', URL='${final_video_url_from_ef}'. Error message: '${error_message}'`);
    throw new Error(`Edge function returned unexpected state ('${new_status}') or missing URL for ${piApiTaskId}.`);

  } catch (err: any) {
    console.error(`[VideoProcessor] Error in downloadAndStoreVideo (confirming status via Edge Function) for PiAPI Task ${piApiTaskId} (DB ID ${videoDbId}):`, err.message);
    throw err;
  }
}
  getActiveTasks(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  isProcessing(taskId: string): boolean {
    return this.activeTasks.has(taskId);
  }
}

export const videoProcessingService = new VideoProcessingService();
