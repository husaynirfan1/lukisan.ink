// In enhancedVideoProcessor.ts

import { supabase } from './supabase';
import { checkVideoStatus } from './piapi';
import toast from 'react-hot-toast';

const MAX_POLLING_ATTEMPTS = 120;
const POLL_INTERVAL = 15000;

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
  ): Promise<void> {
    if (this.activeProcessors.has(videoDbId)) {
      console.log(`[Processor] Monitoring for ${videoDbId} is already active.`);
      return;
    }

    const abortController = new AbortController();
    this.activeProcessors.set(videoDbId, abortController);
    console.log(`[Processor] Starting full processing workflow for video: ${videoDbId}`);

    try {
      // Step 1: Monitor PiAPI task. This will throw an error on failure.
      const piapiResult = await this.monitorPiAPITask(taskId, videoDbId, abortController.signal);
      
      // Step 2: Download and store the video.
      const storageResult = await this.downloadAndStoreVideo(piapiResult.videoUrl, userId, taskId);
      
      // Step 3: Update database with final success status.
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

    } catch (error: any) {
      console.error(`[Processor] Workflow failed for video ${videoDbId}:`, error.message);
      
      try {
        await this.updateDatabase(videoDbId, { status: 'failed', error_message: error.message });
      } catch (dbError) {
        console.error(`[Processor] Could not update failure status for ${videoDbId}:`, dbError);
      }

      // Re-throw the clean error for the manager to catch and display.
      throw error;

    } finally {
      this.activeProcessors.delete(videoDbId);
    }
  }

  private async monitorPiAPITask(taskId: string, videoDbId: string, signal: AbortSignal): Promise<{ videoUrl: string }> {
    for (let i = 0; i < MAX_POLLING_ATTEMPTS; i++) {
      if (signal.aborted) throw new Error('Processing was aborted.');
      
      // Since checkVideoStatus now throws on any error, we can simplify this.
      const statusResponse = await checkVideoStatus(taskId);
      
      await this.updateDatabase(videoDbId, {
        status: statusResponse.status,
        progress: statusResponse.progress || 0,
      });

      if (statusResponse.status === 'completed' && statusResponse.video_url) {
        return { videoUrl: statusResponse.video_url };
      }
      
      // No need to check for 'failed' here, as it would have thrown an error.
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
    throw new Error('Polling timed out after 30 minutes.');
  }

  private async downloadAndStoreVideo(
    tempUrl: string,
    userId: string,
    taskId: string,
  ): Promise<{ publicUrl: string, storagePath: string, fileSize: number }> {
    await this.updateDatabase(taskId, { status: 'downloading', progress: 95 });
    const response = await fetch(tempUrl);
    if (!response.ok) throw new Error(`Failed to download from PiAPI: ${response.statusText}`);
    const videoBlob = await response.blob();
    
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