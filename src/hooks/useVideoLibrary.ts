import { useState, useEffect } from 'react';
import { videoLibraryService, VideoRecord, VideoFilter } from '../lib/videoLibraryService';
import { useAuth } from './useAuth';

export interface UseVideoLibraryResult {
  videos: VideoRecord[];
  loading: boolean;
  error: string | null;
  stats: {
    total: number;
    completed: number;
    processing: number;
    failed: number;
    totalSize: number;
  };
  refreshVideos: () => Promise<void>;
  deleteVideo: (videoId: string) => Promise<void>;
  downloadVideo: (videoUrl: string, filename: string) => Promise<void>;
  checkVideoStatus: (videoId: string) => Promise<void>;
  filterVideos: (filters: VideoFilter) => VideoRecord[];
}

/**
 * Hook for accessing and managing the video library
 */
export const useVideoLibrary = (): UseVideoLibraryResult => {
  const { user } = useAuth();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    processing: 0,
    failed: 0,
    totalSize: 0
  });

  // Initialize video library service
  useEffect(() => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    const initializeLibrary = async () => {
      try {
        await videoLibraryService.initialize(user.id);
        setLoading(false);
      } catch (err: any) {
        console.error('[useVideoLibrary] Initialization error:', err);
        setError(err.message || 'Failed to load video library');
        setLoading(false);
      }
    };
    
    initializeLibrary();
    
    // Subscribe to video updates
    const unsubscribe = videoLibraryService.subscribe('hook-library', (updatedVideos) => {
      setVideos(updatedVideos);
      
      // Update stats
      const total = updatedVideos.length;
      const completed = updatedVideos.filter(v => v.status === 'completed').length;
      const processing = updatedVideos.filter(v => 
        ['pending', 'processing', 'downloading', 'storing'].includes(v.status)
      ).length;
      const failed = updatedVideos.filter(v => v.status === 'failed').length;
      
      const totalSize = updatedVideos.reduce((sum, video) => 
        sum + (video.file_size || 0), 0
      );
      
      setStats({
        total,
        completed,
        processing,
        failed,
        totalSize
      });
    });
    
    return () => {
      unsubscribe();
    };
  }, [user]);

  // Refresh videos
  const refreshVideos = async (): Promise<void> => {
    if (!user) return;
    
    try {
      await videoLibraryService.fetchVideos(user.id, true);
    } catch (err: any) {
      console.error('[useVideoLibrary] Refresh error:', err);
      setError(err.message || 'Failed to refresh video library');
      throw err;
    }
  };

  // Delete video
  const deleteVideo = async (videoId: string): Promise<void> => {
    try {
      await videoLibraryService.deleteVideo(videoId);
    } catch (err: any) {
      console.error('[useVideoLibrary] Delete error:', err);
      setError(err.message || 'Failed to delete video');
      throw err;
    }
  };

  // Download video
  const downloadVideo = async (videoUrl: string, filename: string): Promise<void> => {
    try {
      await videoLibraryService.downloadVideo(videoUrl, filename);
    } catch (err: any) {
      console.error('[useVideoLibrary] Download error:', err);
      setError(err.message || 'Failed to download video');
      throw err;
    }
  };

  // Check video status
  const checkVideoStatus = async (videoId: string): Promise<void> => {
    try {
      await videoLibraryService.forceCheckStatus(videoId);
    } catch (err: any) {
      console.error('[useVideoLibrary] Status check error:', err);
      setError(err.message || 'Failed to check video status');
      throw err;
    }
  };

  // Filter videos
  const filterVideos = (filters: VideoFilter): VideoRecord[] => {
    return videoLibraryService.getVideos(filters);
  };

  return {
    videos,
    loading,
    error,
    stats,
    refreshVideos,
    deleteVideo,
    downloadVideo,
    checkVideoStatus,
    filterVideos
  };
};