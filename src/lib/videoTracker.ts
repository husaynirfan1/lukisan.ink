import { supabase } from './supabase';
import { videoStatusManager } from './videoStatusManager';

export interface VideoTrackingData {
  id: string;
  user_id: string;
  video_id: string; // PiAPI task ID
  status: 'pending' | 'processing' | 'running' | 'downloading' | 'storing' | 'completed' | 'failed';
  progress: number;
  download_progress?: number;
  storage_progress?: number;
  file_size?: number;
  storage_path?: string;
  video_url?: string;
  error_message?: string;
  integrity_verified?: boolean;
  created_at: string;
  updated_at: string;
}

export interface StorageInfo {
  used_space: number;
  available_space: number;
  total_space: number;
  video_count: number;
}

export class VideoTracker {
  private static instance: VideoTracker;
  private subscribers: Map<string, (data: VideoTrackingData) => void> = new Map();
  private storageSubscribers: Set<(info: StorageInfo) => void> = new Set();
  private realtimeChannel: any = null;

  private constructor() {
    this.setupRealtimeSubscription();
  }

  static getInstance(): VideoTracker {
    if (!VideoTracker.instance) {
      VideoTracker.instance = new VideoTracker();
    }
    return VideoTracker.instance;
  }

  private setupRealtimeSubscription(): void {
    console.log('[VideoTracker] Setting up real-time subscription');
    
    this.realtimeChannel = supabase.channel('video-tracking-updates')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'video_generations'
        },
        (payload) => {
          console.log('[VideoTracker] Real-time update received:', payload);
          this.handleRealtimeUpdate(payload);
        }
      )
      .subscribe((status) => {
        console.log('[VideoTracker] Subscription status:', status);
      });
  }

  private handleRealtimeUpdate(payload: any): void {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    console.log('[VideoTracker] Processing real-time update:', {
      eventType,
      videoId: newRecord?.id || oldRecord?.id,
      status: newRecord?.status,
      progress: newRecord?.progress
    });

    // Notify specific video subscribers
    const videoId = newRecord?.id || oldRecord?.id;
    if (videoId && this.subscribers.has(videoId)) {
      const subscriber = this.subscribers.get(videoId);
      if (subscriber && newRecord) {
        subscriber(this.transformToTrackingData(newRecord));
      }
    }

    // Notify storage subscribers
    this.notifyStorageSubscribers();
  }

  private transformToTrackingData(record: any): VideoTrackingData {
    return {
      id: record.id,
      user_id: record.user_id,
      video_id: record.video_id,
      status: record.status || 'pending',
      progress: record.progress || 0,
      download_progress: record.download_progress,
      storage_progress: record.storage_progress,
      file_size: record.file_size,
      storage_path: record.storage_path,
      video_url: record.video_url,
      error_message: record.error_message,
      integrity_verified: record.integrity_verified,
      created_at: record.created_at,
      updated_at: record.updated_at || record.created_at
    };
  }

  async trackVideoGeneration(
    userId: string,
    taskId: string,
    initialData: Partial<VideoTrackingData>
  ): Promise<string> {
    console.log('[VideoTracker] Starting to track video generation:', { userId, taskId });

    try {
      const { data, error } = await supabase
        .from('video_generations')
        .insert({
          user_id: userId,
          video_id: taskId,
          video_type: initialData.video_type || 'marketing',
          message: initialData.message || '',
          status: 'pending',
          progress: 0,
          ...initialData
        })
        .select('id')
        .single();

      if (error) {
        console.error('[VideoTracker] Error inserting video record:', error);
        throw error;
      }

      const videoId = data.id;
      console.log('[VideoTracker] Video tracking started:', videoId);

      // Start monitoring with the video status manager
      videoStatusManager.startMonitoring(videoId, taskId, userId);

      return videoId;
    } catch (error) {
      console.error('[VideoTracker] Failed to start tracking:', error);
      throw error;
    }
  }

  async updateVideoStatus(
    videoId: string,
    updates: Partial<VideoTrackingData>
  ): Promise<void> {
    console.log('[VideoTracker] Updating video status:', { videoId, updates });

    try {
      const updateData: any = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('video_generations')
        .update(updateData)
        .eq('id', videoId);

      if (error) {
        console.error('[VideoTracker] Error updating video status:', error);
        throw error;
      }

      console.log('[VideoTracker] Video status updated successfully');
    } catch (error) {
      console.error('[VideoTracker] Failed to update video status:', error);
      throw error;
    }
  }

  async updateDownloadProgress(
    videoId: string,
    downloadProgress: number,
    fileSize?: number
  ): Promise<void> {
    await this.updateVideoStatus(videoId, {
      status: 'downloading',
      download_progress: downloadProgress,
      file_size: fileSize,
      progress: Math.min(downloadProgress, 90) // Reserve 10% for storage
    });
  }

  async updateStorageProgress(
    videoId: string,
    storageProgress: number
  ): Promise<void> {
    await this.updateVideoStatus(videoId, {
      status: 'storing',
      storage_progress: storageProgress,
      progress: 90 + (storageProgress * 0.1) // Last 10% for storage
    });
  }

  async markVideoCompleted(
    videoId: string,
    videoUrl: string,
    storagePath: string,
    fileSize: number,
    integrityVerified: boolean = true
  ): Promise<void> {
    await this.updateVideoStatus(videoId, {
      status: 'completed',
      progress: 100,
      video_url: videoUrl,
      storage_path: storagePath,
      file_size: fileSize,
      integrity_verified: integrityVerified,
      download_progress: 100,
      storage_progress: 100
    });
  }

  async markVideoFailed(
    videoId: string,
    errorMessage: string
  ): Promise<void> {
    await this.updateVideoStatus(videoId, {
      status: 'failed',
      error_message: errorMessage,
      progress: 0
    });
  }

  async getVideoTrackingData(videoId: string): Promise<VideoTrackingData | null> {
    try {
      const { data, error } = await supabase
        .from('video_generations')
        .select('*')
        .eq('id', videoId)
        .single();

      if (error || !data) {
        console.error('[VideoTracker] Error fetching video data:', error);
        return null;
      }

      return this.transformToTrackingData(data);
    } catch (error) {
      console.error('[VideoTracker] Failed to get video tracking data:', error);
      return null;
    }
  }

  async getUserVideos(userId: string): Promise<VideoTrackingData[]> {
    try {
      const { data, error } = await supabase
        .from('video_generations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[VideoTracker] Error fetching user videos:', error);
        return [];
      }

      return (data || []).map(record => this.transformToTrackingData(record));
    } catch (error) {
      console.error('[VideoTracker] Failed to get user videos:', error);
      return [];
    }
  }

  async getStorageInfo(userId: string): Promise<StorageInfo> {
    try {
      // Get user's video files from storage
      const { data: files, error: filesError } = await supabase.storage
        .from('generated-videos')
        .list(`videos/${userId}`, {
          limit: 1000,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (filesError) {
        console.error('[VideoTracker] Error fetching storage files:', filesError);
      }

      // Calculate storage usage
      const usedSpace = (files || []).reduce((total, file) => {
        return total + (file.metadata?.size || 0);
      }, 0);

      // Get video count from database
      const { count, error: countError } = await supabase
        .from('video_generations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed');

      if (countError) {
        console.error('[VideoTracker] Error counting videos:', countError);
      }

      // Calculate limits (example: 1GB for free users, 10GB for pro users)
      const totalSpace = 1024 * 1024 * 1024; // 1GB default
      const availableSpace = Math.max(0, totalSpace - usedSpace);

      return {
        used_space: usedSpace,
        available_space: availableSpace,
        total_space: totalSpace,
        video_count: count || 0
      };
    } catch (error) {
      console.error('[VideoTracker] Failed to get storage info:', error);
      return {
        used_space: 0,
        available_space: 0,
        total_space: 0,
        video_count: 0
      };
    }
  }

  async verifyVideoIntegrity(videoId: string, expectedSize?: number): Promise<boolean> {
    try {
      const trackingData = await this.getVideoTrackingData(videoId);
      if (!trackingData?.video_url) {
        return false;
      }

      // Verify the video file exists and is accessible
      const response = await fetch(trackingData.video_url, { method: 'HEAD' });
      if (!response.ok) {
        return false;
      }

      // Check file size if provided
      if (expectedSize) {
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) !== expectedSize) {
          return false;
        }
      }

      // Update integrity status
      await this.updateVideoStatus(videoId, {
        integrity_verified: true
      });

      return true;
    } catch (error) {
      console.error('[VideoTracker] Error verifying video integrity:', error);
      await this.updateVideoStatus(videoId, {
        integrity_verified: false
      });
      return false;
    }
  }

  subscribeToVideo(videoId: string, callback: (data: VideoTrackingData) => void): () => void {
    console.log('[VideoTracker] Subscribing to video updates:', videoId);
    this.subscribers.set(videoId, callback);

    return () => {
      console.log('[VideoTracker] Unsubscribing from video updates:', videoId);
      this.subscribers.delete(videoId);
    };
  }

  subscribeToStorage(callback: (info: StorageInfo) => void): () => void {
    console.log('[VideoTracker] Subscribing to storage updates');
    this.storageSubscribers.add(callback);

    return () => {
      console.log('[VideoTracker] Unsubscribing from storage updates');
      this.storageSubscribers.delete(callback);
    };
  }

  private async notifyStorageSubscribers(): Promise<void> {
    // This would typically get the current user ID from auth context
    // For now, we'll trigger a refresh for all storage subscribers
    for (const callback of this.storageSubscribers) {
      // Note: In a real implementation, you'd pass the actual storage info
      // callback(await this.getStorageInfo(userId));
    }
  }

  cleanup(): void {
    console.log('[VideoTracker] Cleaning up video tracker');
    this.subscribers.clear();
    this.storageSubscribers.clear();
    
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }
}

export const videoTracker = VideoTracker.getInstance();