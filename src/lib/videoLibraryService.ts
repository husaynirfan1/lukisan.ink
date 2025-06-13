import { supabase } from './supabase';
import { videoProcessingService } from './videoProcessingService';
import toast from 'react-hot-toast';

export interface VideoRecord {
  id: string;
  user_id: string;
  video_id: string; // PiAPI task ID
  video_type: string;
  message: string;
  video_url: string | null;
  thumbnail_url?: string;
  storage_path?: string;
  status: 'pending' | 'processing' | 'downloading' | 'storing' | 'completed' | 'failed';
  progress: number;
  file_size?: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface VideoFilter {
  status?: string[];
  type?: string;
  search?: string;
  sortBy?: 'created_at' | 'updated_at' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface VideoStats {
  total: number;
  completed: number;
  processing: number;
  failed: number;
  totalSize: number;
}

/**
 * Service for managing video library data
 */
class VideoLibraryService {
  private static instance: VideoLibraryService;
  private realtimeSubscription: any = null;
  private subscribers: Map<string, (videos: VideoRecord[]) => void> = new Map();
  private cachedVideos: VideoRecord[] = [];
  private lastFetchTime: number = 0;
  private isFetching: boolean = false;

  private constructor() {}

  public static getInstance(): VideoLibraryService {
    if (!VideoLibraryService.instance) {
      VideoLibraryService.instance = new VideoLibraryService();
    }
    return VideoLibraryService.instance;
  }

  /**
   * Initialize the service and set up realtime subscription
   */
  public async initialize(userId: string): Promise<void> {
    // Set up realtime subscription
    this.setupRealtimeSubscription(userId);
    
    // Fetch initial data
    await this.fetchVideos(userId);
    
    // Start monitoring any processing videos
    this.startMonitoringProcessingVideos(userId);
  }

  /**
   * Set up realtime subscription for video updates
   */
  private setupRealtimeSubscription(userId: string): void {
    // Clean up existing subscription if any
    if (this.realtimeSubscription) {
      supabase.removeChannel(this.realtimeSubscription);
    }
    
    // Create new subscription
    this.realtimeSubscription = supabase.channel('video-library-changes')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'video_generations',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('[VideoLibrary] Realtime update received:', payload);
          this.handleRealtimeUpdate(payload);
        }
      )
      .subscribe((status) => {
        console.log('[VideoLibrary] Subscription status:', status);
      });
  }

  /**
   * Handle realtime updates from Supabase
   */
  private handleRealtimeUpdate(payload: any): void {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    // Update cached videos based on the event type
    if (eventType === 'INSERT') {
      this.cachedVideos = [newRecord, ...this.cachedVideos];
    } else if (eventType === 'UPDATE') {
      this.cachedVideos = this.cachedVideos.map(video => 
        video.id === newRecord.id ? { ...video, ...newRecord } : video
      );
    } else if (eventType === 'DELETE') {
      this.cachedVideos = this.cachedVideos.filter(video => video.id !== oldRecord.id);
    }
    
    // Notify subscribers
    this.notifySubscribers();
  }

  /**
   * Fetch videos from the database
   */
  public async fetchVideos(userId: string, force: boolean = false): Promise<VideoRecord[]> {
    // Prevent concurrent fetches
    if (this.isFetching) {
      return this.cachedVideos;
    }
    
    // Use cache if available and not forced
    const now = Date.now();
    if (!force && this.cachedVideos.length > 0 && now - this.lastFetchTime < 30000) {
      return this.cachedVideos;
    }
    
    this.isFetching = true;
    
    try {
      const { data, error } = await supabase
        .from('video_generations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      this.cachedVideos = data || [];
      this.lastFetchTime = now;
      
      // Notify subscribers
      this.notifySubscribers();
      
      return this.cachedVideos;
    } catch (error) {
      console.error('[VideoLibrary] Error fetching videos:', error);
      throw error;
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Get videos with filtering and sorting
   */
  public getVideos(filters?: VideoFilter): VideoRecord[] {
    let filteredVideos = [...this.cachedVideos];
    
    // Apply filters
    if (filters) {
      if (filters.status && filters.status.length > 0) {
        filteredVideos = filteredVideos.filter(video => 
          filters.status!.includes(video.status)
        );
      }
      
      if (filters.type) {
        filteredVideos = filteredVideos.filter(video => 
          video.video_type === filters.type
        );
      }
      
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredVideos = filteredVideos.filter(video => 
          video.message.toLowerCase().includes(searchLower) ||
          video.video_type.toLowerCase().includes(searchLower)
        );
      }
      
      // Apply sorting
      if (filters.sortBy) {
        filteredVideos.sort((a, b) => {
          const aValue = a[filters.sortBy!];
          const bValue = b[filters.sortBy!];
          
          if (filters.sortOrder === 'asc') {
            return aValue > bValue ? 1 : -1;
          } else {
            return aValue < bValue ? 1 : -1;
          }
        });
      }
    }
    
    return filteredVideos;
  }

  /**
   * Get video statistics
   */
  public getVideoStats(): VideoStats {
    const total = this.cachedVideos.length;
    const completed = this.cachedVideos.filter(v => v.status === 'completed').length;
    const processing = this.cachedVideos.filter(v => 
      ['pending', 'processing', 'downloading', 'storing'].includes(v.status)
    ).length;
    const failed = this.cachedVideos.filter(v => v.status === 'failed').length;
    
    const totalSize = this.cachedVideos.reduce((sum, video) => 
      sum + (video.file_size || 0), 0
    );
    
    return {
      total,
      completed,
      processing,
      failed,
      totalSize
    };
  }

  /**
   * Delete a video
   */
  public async deleteVideo(videoId: string): Promise<void> {
    try {
      // Get the video first to check if it has a storage path
      const { data: video, error: fetchError } = await supabase
        .from('video_generations')
        .select('storage_path')
        .eq('id', videoId)
        .single();
      
      if (fetchError) {
        throw fetchError;
      }
      
      // If the video has a storage path, delete the file from storage
      if (video?.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('generated-videos')
          .remove([video.storage_path]); 
        
        if (storageError) {
          console.warn('[VideoLibrary] Failed to delete from storage:', storageError);
          // Continue with database deletion even if storage deletion fails
        }
      }
      
      // Delete from database
      const { error: deleteError } = await supabase
        .from('video_generations')
        .delete()
        .eq('id', videoId);
      
      if (deleteError) {
        throw deleteError;
      }
      
      // Update cache
      this.cachedVideos = this.cachedVideos.filter(video => video.id !== videoId);
      
      // Notify subscribers
      this.notifySubscribers();
      
    } catch (error) {
      console.error('[VideoLibrary] Error deleting video:', error);
      throw error;
    }
  }

  /**
   * Download a video
   */
  public async downloadVideo(videoUrl: string, filename: string): Promise<void> {
    try {
      const response = await fetch(videoUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
    } catch (error) {
      console.error('[VideoLibrary] Error downloading video:', error);
      throw error;
    }
  }

  /**
   * Start monitoring processing videos
   */
  private startMonitoringProcessingVideos(userId: string): void {
    const processingVideos = this.cachedVideos.filter(video => 
      ['pending', 'processing'].includes(video.status)
    );
    
    console.log(`[VideoLibrary] Starting monitoring for ${processingVideos.length} processing videos`);
    
    for (const video of processingVideos) {
      videoProcessingService.startProcessing(video.video_id, video.id, userId);
    }
  }

  /**
   * Force check the status of a video
   */
  public async forceCheckStatus(videoId: string): Promise<void> {
    try {
      await videoProcessingService.forceCheckStatus(videoId);
    } catch (error) {
      console.error('[VideoLibrary] Force check failed:', error);
      throw error;
    }
  }

  /**
   * Subscribe to video updates
   */
  public subscribe(id: string, callback: (videos: VideoRecord[]) => void): () => void {
    this.subscribers.set(id, callback);
    
    // Immediately notify with current data
    callback(this.cachedVideos);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(id);
    };
  }

  /**
   * Notify all subscribers of updates
   */
  private notifySubscribers(): void {
    for (const callback of this.subscribers.values()) {
      callback(this.cachedVideos);
    }
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (this.realtimeSubscription) {
      supabase.removeChannel(this.realtimeSubscription);
      this.realtimeSubscription = null;
    }
    
    this.subscribers.clear();
    this.cachedVideos = [];
  }
}

export const videoLibraryService = VideoLibraryService.getInstance();