import { supabase } from './supabase'; // Your regular client-side Supabase client instance
import { videoProcessingService } from './videoProcessingService';
import toast from 'react-hot-toast';

export interface VideoRecord {
  id: string;
  user_id: string;
  video_id: string; // PiAPI task ID
  video_type: string;
  message: string;
  video_url: string | null;
  logo_url?: string | null; // Corrected to logo_url and made optional as it might be null
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
 * Implemented as a Singleton to ensure a single instance manages subscriptions and cache.
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
   * Initialize the service and set up realtime subscription.
   * Fetches initial video data and starts monitoring processing videos.
   * @param userId The ID of the current authenticated user.
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
   * Set up realtime subscription for video updates specific to the user.
   * Cleans up any existing subscription first.
   * @param userId The ID of the user for whom to subscribe to changes.
   */
  private setupRealtimeSubscription(userId: string): void {
    // Clean up existing subscription if any
    if (this.realtimeSubscription) {
      supabase.removeChannel(this.realtimeSubscription);
      this.realtimeSubscription = null;
    }
    
    // Create new subscription
    this.realtimeSubscription = supabase.channel('video-library-changes')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'video_generations',
          filter: `user_id=eq.${userId}` // Filter for the current user's videos
        },
        (payload) => {
          console.log('[VideoLibraryService] Realtime update received:', payload);
          this.handleRealtimeUpdate(payload);
        }
      )
      .subscribe((status) => {
        console.log('[VideoLibraryService] Subscription status:', status);
      });
  }

  /**
   * Handles realtime updates from Supabase, updating the cached videos.
   * @param payload The payload object received from the Supabase Realtime subscription.
   */
  private handleRealtimeUpdate(payload: any): void {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    // Update cached videos based on the event type
    if (eventType === 'INSERT') {
      // Ensure newRecord is cast to VideoRecord and added to the front
      this.cachedVideos = [{ ...newRecord, storage_path: newRecord.video_url ? this.extractStoragePath(newRecord.video_url) : undefined } as VideoRecord, ...this.cachedVideos];
    } else if (eventType === 'UPDATE') {
      this.cachedVideos = this.cachedVideos.map(video => 
        video.id === newRecord.id ? { 
          ...video, 
          ...newRecord, 
          storage_path: newRecord.video_url ? this.extractStoragePath(newRecord.video_url) : undefined 
        } as VideoRecord : video
      );
    } else if (eventType === 'DELETE') {
      this.cachedVideos = this.cachedVideos.filter(video => video.id !== oldRecord.id);
    }
    
    // Notify subscribers
    this.notifySubscribers();
  }

  /**
   * Fetches videos from the database. Can be forced to bypass cache.
   * @param userId The ID of the user whose videos to fetch.
   * @param force If true, bypasses the cache and fetches fresh data.
   * @returns A promise resolving to an array of VideoRecord.
   */
  public async fetchVideos(userId: string, force: boolean = false): Promise<VideoRecord[]> {
    // Prevent concurrent fetches
    if (this.isFetching) {
      return this.cachedVideos;
    }
    
    // Use cache if available and not forced (cache invalidates after 30 seconds)
    const now = Date.now();
    if (!force && this.cachedVideos.length > 0 && now - this.lastFetchTime < 30000) {
      return this.cachedVideos;
    }
    
    this.isFetching = true;
    
    try {
      const { data, error } = await supabase
        .from('video_generations')
        .select('id, user_id, video_id, video_type, message, video_url, logo_url, storage_path, status, progress, file_size, error_message, created_at, updated_at') // Explicitly select logo_url
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      // Map and normalize status and storage_path
      this.cachedVideos = (data || []).map(video => {
        const validStatuses = ['pending', 'processing', 'downloading', 'storing', 'completed', 'failed'];
        let currentStatus = video.status;
        if (!currentStatus || !validStatuses.includes(currentStatus)) {
          currentStatus = 'pending';
        }
        return {
            ...video,
            status: currentStatus,
            storage_path: video.video_url ? this.extractStoragePath(video.video_url) : undefined
        } as VideoRecord;
      });

      this.lastFetchTime = now;
      
      // Notify subscribers
      this.notifySubscribers();
      
      return this.cachedVideos;
    } catch (error) {
      console.error('[VideoLibraryService] Error fetching videos:', error);
      throw error;
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Helper to extract storage path from a Supabase Storage public URL.
   * @param url The public URL of the stored video.
   * @returns The storage path or undefined if not a valid Supabase Storage URL.
   */
  private extractStoragePath(url: string): string | undefined {
    if (!url || !url.includes('supabase.co/storage/v1/object/public/generated-videos/')) {
      return undefined;
    }
    const parts = url.split('/generated-videos/');
    return parts.length > 1 ? parts[1] : undefined;
  }

  /**
   * Retrieves videos from the cache with optional filtering and sorting.
   * @param filters An optional object containing filter and sort criteria.
   * @returns An array of filtered and sorted VideoRecord.
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
          video.video_type.toLowerCase().includes(searchLower) ||
          (video as any).recipient_name?.toLowerCase().includes(searchLower) || // Cast to any to access optional fields
          (video as any).company_name?.toLowerCase().includes(searchLower)
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
   * Calculates and returns statistics about the videos in the library.
   * @returns A VideoStats object.
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
   * Deletes a video record and its associated files from Supabase Storage and database
   * by invoking a secure Edge Function.
   * @param videoId The ID of the video record in the 'video_generations' table to delete.
   * @throws An error if the deletion via Edge Function fails.
   */
  public async deleteVideo(videoId: string): Promise<void> {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      throw new Error("User not authenticated for deletion.");
    }

    console.log(`[VideoLibraryService] Invoking Edge Function 'delete-video-and-data' for video DB ID: ${videoId}`);

    try {
      // Invoke the Edge Function to handle deletion securely
      const { data: rawData, error: efError } = await supabase.functions.invoke('delete-video-and-data', {
        body: { video_db_id: videoId },
      });

      if (efError) {
        console.error(`[VideoLibraryService] Edge function delete error:`, efError);
        throw new Error(efError.message);
      }

      // Parse the raw JSON string response from the Edge Function
      let efResponse: any;
      if (rawData) {
        try {
          efResponse = JSON.parse(rawData as string);
        } catch (parseError) {
          console.error('[VideoLibraryService] Failed to parse Edge Function response from delete function:', rawData, parseError);
          throw new Error('Malformed response from deletion Edge Function.');
        }
      } else {
        throw new Error('No data received from deletion Edge Function.');
      }

      if (!efResponse.success) {
        console.error(`[VideoLibraryService] Deletion Edge Function reported failure:`, efResponse.error || efResponse.message);
        throw new Error(efResponse.error || efResponse.message || 'Deletion failed in Edge Function.');
      }

      console.log(`[VideoLibraryService] Video ${videoId} successfully deleted via Edge Function. Storage deleted: ${efResponse.storageDeleted}, Logo deleted: ${efResponse.logoDeleted}`);

      // The Realtime subscription should automatically update this.cachedVideos,
      // so no direct manipulation of this.cachedVideos is strictly needed here for deletion.
      // However, we can optimistically update for immediate UI feedback.
      this.cachedVideos = this.cachedVideos.filter(video => video.id !== videoId);
      this.notifySubscribers(); // Notify immediately for UI update

    } catch (error: any) {
      console.error(`[VideoLibraryService] Error in deleteVideo for ${videoId}:`, error);
      throw error; // Re-throw to be caught by the calling handleDelete in component
    }
  }

  /**
   * Downloads a video from a given URL.
   * @param videoUrl The public URL of the video to download.
   * @param filename The suggested filename for the download.
   * @throws An error if the download fails.
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
      
      // Clean up the object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
    } catch (error) {
      console.error('[VideoLibraryService] Error downloading video:', error);
      throw error;
    }
  }

  /**
   * Starts monitoring any videos that are currently processing (e.g., pending, processing)
   * by delegating to videoProcessingService.
   * @param userId The ID of the user whose videos to monitor.
   */
  private startMonitoringProcessingVideos(userId: string): void {
    const processingVideos = this.cachedVideos.filter(video => 
      ['pending', 'processing', 'downloading', 'storing'].includes(video.status)
    );
    
    console.log(`[VideoLibraryService] Starting monitoring for ${processingVideos.length} processing videos`);
    
    for (const video of processingVideos) {
      // videoProcessingService will handle the actual polling and DB updates
      videoProcessingService.startProcessing(video.video_id, video.id, userId);
    }
  }

  /**
   * Force checks the status of a specific video by delegating to videoProcessingService.
   * This is typically triggered by a manual "retry" action in the UI.
   * @param videoId The database ID of the video to force check.
   * @throws An error if the force check operation fails.
   */
  public async forceCheckStatus(videoId: string): Promise<void> {
    try {
      await videoProcessingService.forceCheckStatus(videoId);
    } catch (error) {
      console.error('[VideoLibraryService] Force check failed:', error);
      throw error;
    }
  }

  /**
   * Subscribes a component to video updates.
   * @param id A unique identifier for the subscriber.
   * @param callback The function to call when videos are updated.
   * @returns An unsubscribe function.
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
   * Notifies all registered subscribers of updates to the video cache.
   */
  private notifySubscribers(): void {
    for (const callback of this.subscribers.values()) {
      callback(this.cachedVideos);
    }
  }

  /**
   * Cleans up all active subscriptions and cached data.
   */
  public cleanup(): void {
    if (this.realtimeSubscription) {
      supabase.removeChannel(this.realtimeSubscription);
      this.realtimeSubscription = null;
    }
    
    this.subscribers.clear();
    this.cachedVideos = [];
    this.lastFetchTime = 0; // Reset last fetch time
    this.isFetching = false; // Reset fetching state
  }
}

export const videoLibraryService = VideoLibraryService.getInstance();