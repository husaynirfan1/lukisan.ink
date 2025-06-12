import { supabase } from './supabase';
import { checkVideoStatus } from './piapi';
import toast from 'react-hot-toast';

const MAX_POLLING_ATTEMPTS = 120; // Poll for a maximum of 30 minutes (120 attempts * 15s)
const POLL_INTERVAL = 15000; // 15 seconds

export interface VideoProcessingResult {
  success: boolean;
  finalUrl?: string;
  error?: string;
}

class EnhancedVideoProcessor {
  private activeProcessors: Map<string, AbortController> = new Map();

  public static getInstance(): EnhancedVideoProcessor {
    return this.instance || (this.instance = new this());
  }
  private static instance: EnhancedVideoProcessor;

  public async processVideo(
    taskId: string,
    videoDbId: string,
    userId: string
  ): Promise<VideoProcessingResult> {
    if (this.activeProcessors.has(videoDbId)) {
      console.log(`[Processor] Monitoring for ${videoDbId} is already active.`);
      return { success: true };
    }

    const abortController = new AbortController();
    this.activeProcessors.set(videoDbId, abortController);
    console.log(`[Processor] Starting full processing workflow for video: ${videoDbId}`);

    try {
      const piapiResult = await this.monitorPiAPITask(taskId, videoDbId, abortController.signal);
      if (!piapiResult.success || !piapiResult.videoUrl) {
        throw new Error(piapiResult.error || 'Task completed without a video URL.');
      }

      const storageResult = await this.downloadAndStoreVideo(piapiResult.videoUrl, userId, taskId, videoDbId);
      if (!storageResult.success || !storageResult.publicUrl) {
        throw new Error(storageResult.error || 'Failed to store video in user library.');
      }
      
      await this.updateDatabase(videoDbId, {
        status: 'completed',
        video_url: storageResult.publicUrl,
        storage_path: storageResult.storagePath,
        file_size: storageResult.fileSize,
        progress: 100,
        error_message: null
      });

      console.log(`[Processor] Successfully processed and stored video ${videoDbId}. Final URL: ${storageResult.publicUrl}`);
      toast.success('Video is ready and saved to your library!');
      
      return { success: true, finalUrl: storageResult.publicUrl };

    } catch (error: any) {
      console.error(`[Processor] Workflow failed for video ${videoDbId}:`, error);
      await this.updateDatabase(videoDbId, { 
        status: 'failed', 
        error_message: typeof error === 'string' ? error : error.message || 'Unknown error'
      });
      
      // Ensure we're throwing a proper Error object
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error(typeof error === 'string' ? error : 'Unknown processing error');
      }
    } finally {
      this.activeProcessors.delete(videoDbId);
    }
  }

  private async monitorPiAPITask(taskId: string, videoDbId: string, signal: AbortSignal): Promise<{ success: boolean, videoUrl?: string, error?: string }> {
    for (let i = 0; i < MAX_POLLING_ATTEMPTS; i++) {
      if (signal.aborted) throw new Error('Processing was aborted.');

      try {
        const statusResponse = await checkVideoStatus(taskId);
        
        await this.updateDatabase(videoDbId, {
          status: statusResponse.status,
          progress: statusResponse.progress || 0,
          error_message: statusResponse.error
        });

        // IMPROVED: Check for video URL in multiple places
        const videoUrl = statusResponse.video_url;
        
        if (statusResponse.status === 'completed' && videoUrl) {
          console.log(`[Processor] PiAPI task complete. Found video URL for ${videoDbId}: ${videoUrl}`);
          return { success: true, videoUrl };
        }
        
        // If we have a video URL but status isn't completed, still consider it a success
        if (videoUrl) {
          console.log(`[Processor] Found video URL for ${videoDbId} even though status is ${statusResponse.status}: ${videoUrl}`);
          return { success: true, videoUrl };
        }
        
        if (statusResponse.status === 'failed') {
          return { success: false, error: statusResponse.error || 'PiAPI task failed without a specific error.' };
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      } catch (error: any) {
        console.error(`[Processor] Error checking status for task ${taskId}:`, error);
        // Don't throw here, just log and continue polling
      }
    }
    return { success: false, error: 'Polling timed out after 30 minutes.' };
  }

  private async downloadAndStoreVideo(
    tempUrl: string,
    userId: string,
    taskId: string,
    videoDbId: string
  ): Promise<{ success: boolean, publicUrl?: string, storagePath?: string, fileSize?: number, error?: string }> {
    try {
      console.log(`[Processor] Downloading video for ${videoDbId} from temporary URL: ${tempUrl}`);
      await this.updateDatabase(videoDbId, { status: 'downloading', progress: 95 });

      const response = await fetch(tempUrl);
      if (!response.ok) throw new Error(`Failed to download from PiAPI: ${response.statusText}`);
      const videoBlob = await response.blob();
      
      console.log(`[Processor] Storing video for ${videoDbId} in Supabase Storage.`);
      await this.updateDatabase(videoDbId, { status: 'storing', progress: 98 });
      const filePath = `videos/${userId}/${taskId}.mp4`;
      
      const { error: uploadError } = await supabase.storage
        .from('generated-videos')
        .upload(filePath, videoBlob, { upsert: true });
        
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage.from('generated-videos').getPublicUrl(filePath);
      if (!urlData.publicUrl) throw new Error('Failed to get public URL from Supabase Storage.');

      return {
        success: true,
        publicUrl: urlData.publicUrl,
        storagePath: filePath,
        fileSize: videoBlob.size,
      };

    } catch (error: any) {
      return { 
        success: false, 
        error: typeof error === 'string' ? error : error.message || 'Unknown error during video storage'
      };
    }
  }

  private async updateDatabase(videoDbId: string, updates: any): Promise<void> {
    try {
      const { error } = await supabase
        .from('video_generations')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', videoDbId);
      
      if (error) throw new Error(error.message);
    } catch (error) {
      console.error(`[Processor] Failed to update database for ${videoDbId}:`, error);
      // Don't re-throw here, as this is a non-critical update. The main flow can continue.
    }
  }

  public stopProcessing(videoDbId: string): void {
    const controller = this.activeProcessors.get(videoDbId);
    if (controller) {
      controller.abort();
      this.activeProcessors.delete(videoDbId);
      console.log(`[Processor] Stopped monitoring video: ${videoDbId}`);
    }
  }
}

export const enhancedVideoProcessor = EnhancedVideoProcessor.getInstance();