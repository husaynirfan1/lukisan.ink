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

  private static instance: EnhancedVideoProcessor;
  public static getInstance(): EnhancedVideoProcessor {
    return this.instance || (this.instance = new this());
  }

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

      const storageResult = await this.downloadAndStoreVideo(piapiResult.videoUrl, userId, taskId);
      
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
      
      // Ensure we always have a clean error message string.
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Attempt to update the database with the failure, but don't let this stop the process.
      try {
        await this.updateDatabase(videoDbId, { status: 'failed', error_message: errorMessage });
      } catch (dbError) {
        console.error(`[Processor] Could not update failure status for ${videoDbId}:`, dbError);
      }

      // IMPORTANT: Always throw a NEW, standard Error object for the manager to catch.
      throw new Error(errorMessage);

    } finally {
      this.activeProcessors.delete(videoDbId);
    }
  }

  private async monitorPiAPITask(taskId: string, videoDbId: string, signal: AbortSignal): Promise<{ videoUrl: string }> {
    for (let i = 0; i < MAX_POLLING_ATTEMPTS; i++) {
      if (signal.aborted) throw new Error('Processing was aborted.');

      const statusResponse = await checkVideoStatus(taskId);
      
      await this.updateDatabase(videoDbId, {
        status: statusResponse.status,
        progress: statusResponse.progress || 0,
      });

      if (statusResponse.status === 'completed' && statusResponse.video_url) {
        console.log(`[Processor] PiAPI task complete. Found temporary URL for ${videoDbId}.`);
        return { videoUrl: statusResponse.video_url };
      }
      
      if (statusResponse.status === 'failed') {
        throw new Error(statusResponse.error || 'PiAPI task failed without a specific error.');
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
    throw new Error('Polling timed out after 30 minutes.');
  }

  private async downloadAndStoreVideo(
    tempUrl: string,
    userId: string,
    taskId: string,
  ): Promise<{ publicUrl: string, storagePath: string, fileSize: number }> {
    console.log(`[Processor] Downloading video from temporary URL.`);
    await this.updateDatabase(taskId, { status: 'downloading', progress: 95 });

    const response = await fetch(tempUrl);
    if (!response.ok) throw new Error(`Failed to download from PiAPI: ${response.statusText}`);
    const videoBlob = await response.blob();
    
    console.log(`[Processor] Storing video in Supabase Storage.`);
    await this.updateDatabase(taskId, { status: 'storing', progress: 98 });
    const filePath = `videos/${userId}/${taskId}.mp4`;
    
    const { error: uploadError } = await supabase.storage
      .from('generated-videos')
      .upload(filePath, videoBlob, { upsert: true });
      
    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage.from('generated-videos').getPublicUrl(filePath);
    if (!urlData.publicUrl) throw new Error('Failed to get public URL from Supabase Storage.');

    return {
      publicUrl: urlData.publicUrl,
      storagePath: filePath,
      fileSize: videoBlob.size,
    };
  }

  private async updateDatabase(videoDbId: string, updates: any): Promise<void> {
    const { error } = await supabase
      .from('video_generations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', videoDbId);

    if (error) {
      // Log the error but don't re-throw, as these are non-critical progress updates.
      // The main function's catch block will handle terminal failures.
      console.error(`[Processor] Non-critical DB update failed for ${videoDbId}: ${error.message}`);
    }
  }

  public stopProcessing(videoDbId: string): void {
    const controller = this.activeProcessors.get(videoDbId);
    if (controller) {
      controller.abort();
    }
  }
}

export const enhancedVideoProcessor = EnhancedVideoProcessor.getInstance();