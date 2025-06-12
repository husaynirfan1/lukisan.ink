// In enhancedVideoProcessor.ts

import { supabase } from './supabase';
import { checkVideoStatus, TaskStatusResponse } from './piapi';
import toast from 'react-hot-toast';

// --- Constants for Configuration ---
const MAX_POLLING_ATTEMPTS = 120; // Poll for a maximum of 30 minutes (120 attempts * 15s)
const POLL_INTERVAL = 15000; // 15 seconds

export interface VideoProcessingResult {
  success: boolean;
  finalUrl?: string;
  error?: string;
}

// --- Main Processing Logic ---
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
      // Step 1: Monitor the PiAPI task until it's complete and has a URL.
      const piapiResult = await this.monitorPiAPITask(taskId, videoDbId, abortController.signal);
      if (!piapiResult.success || !piapiResult.videoUrl) {
        throw new Error(piapiResult.error || 'Task completed without a video URL.');
      }

      // Step 2: Download the video from the temporary PiAPI URL and upload it to Supabase Storage.
      const storageResult = await this.downloadAndStoreVideo(piapiResult.videoUrl, userId, taskId, videoDbId);
      if (!storageResult.success || !storageResult.publicUrl) {
        throw new Error(storageResult.error || 'Failed to store video in user library.');
      }
      
      // Step 3: Update the database with the FINAL permanent URL and completed status.
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
      await this.updateDatabase(videoDbId, { status: 'failed', error_message: error.message });
      toast.error(`Video generation failed: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      this.activeProcessors.delete(videoDbId);
    }
  }

  // --- Helper Methods ---

  private async monitorPiAPITask(taskId: string, videoDbId: string, signal: AbortSignal): Promise<{ success: boolean, videoUrl?: string, error?: string }> {
    for (let i = 0; i < MAX_POLLING_ATTEMPTS; i++) {
      if (signal.aborted) throw new Error('Processing was aborted.');

      const statusResponse = await checkVideoStatus(taskId);
      
      await this.updateDatabase(videoDbId, {
        status: statusResponse.status,
        progress: statusResponse.progress || 0,
        error_message: statusResponse.error
      });

      if (statusResponse.status === 'completed' && statusResponse.video_url) {
        console.log(`[Processor] PiAPI task complete. Found temporary URL for ${videoDbId}.`);
        return { success: true, videoUrl: statusResponse.video_url };
      }
      
      if (statusResponse.status === 'failed') {
        return { success: false, error: statusResponse.error || 'PiAPI task failed without a specific error.' };
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
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
      console.log(`[Processor] Downloading video for ${videoDbId} from temporary URL.`);
      await this.updateDatabase(videoDbId, { status: 'downloading', progress: 95 });

      // 1. Download video data into a Blob
      const response = await fetch(tempUrl);
      if (!response.ok) throw new Error(`Failed to download from PiAPI: ${response.statusText}`);
      const videoBlob = await response.blob();
      
      // 2. Upload Blob to Supabase Storage
      console.log(`[Processor] Storing video for ${videoDbId} in Supabase Storage.`);
      await this.updateDatabase(videoDbId, { status: 'storing', progress: 98 });
      const filePath = `videos/${userId}/${taskId}.mp4`;
      
      const { error: uploadError } = await supabase.storage
        .from('generated-videos')
        .upload(filePath, videoBlob, { upsert: true });
        
      if (uploadError) throw uploadError;

      // 3. Get the permanent public URL
      const { data: urlData } = supabase.storage.from('generated-videos').getPublicUrl(filePath);
      if (!urlData.publicUrl) throw new Error('Failed to get public URL from Supabase Storage.');

      return {
        success: true,
        publicUrl: urlData.publicUrl,
        storagePath: filePath,
        fileSize: videoBlob.size,
      };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async updateDatabase(videoDbId: string, updates: any): Promise<void> {
    try {
      await supabase
        .from('video_generations')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', videoDbId);
    } catch (error) {
      console.error(`[Processor] Failed to update database for ${videoDbId}:`, error);
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