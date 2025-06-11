import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, 
  Download, 
  Trash2, 
  Clock, 
  Crown, 
  Calendar,
  Search,
  Filter,
  Grid3X3,
  List,
  AlertTriangle,
  Loader2,
  Cloud,
  ExternalLink,
  RefreshCw,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { downloadVideoFromSupabase, deleteVideoFromSupabase } from '../lib/videoStorage';
import { checkVideoStatus, type TaskStatusResponse, showVideoCompleteNotification, requestNotificationPermission } from '../lib/piapi';
import toast from 'react-hot-toast';

interface StoredVideo {
  id: string;
  user_id: string;
  video_type: string;
  message: string;
  recipient_name?: string;
  company_name?: string;
  video_id: string; // This is the task_id from PiAPI
  video_url: string;
  logo_url?: string;
  created_at: string;
  storage_path?: string;
  status?: 'pending' | 'processing' | 'running' | 'completed' | 'failed';
  progress?: number;
}

export const VideoLibrary: React.FC = () => {
  const { user, getUserTier } = useAuth();
  const [videos, setVideos] = useState<StoredVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [deletingVideos, setDeletingVideos] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<Set<string>>(new Set());
  
  // Use a ref to prevent multiple polling intervals
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const userTier = getUserTier();
  const isProUser = userTier === 'pro';

  // Memoize fetchVideos to prevent re-creation on every render
  const fetchVideos = useCallback(async (showLoading = true) => {
    if (!user) return;

    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const { data, error } = await supabase
        .from('video_generations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load video library');
        return;
      }
      
      const videosWithPaths = (data || []).map(video => ({
        ...video,
        storage_path: video.video_url ? extractStoragePath(video.video_url) : undefined
      }));

      setVideos(videosWithPaths);
    } catch (error) {
      toast.error('Failed to load video library');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // --- THE FIX ---
  // The database update now includes the 'status' field.
  const updateVideoInDatabase = useCallback(async (videoId: string, videoUrl: string, status: 'completed' | 'failed', errorMsg?: string) => {
    try {
      const { error } = await supabase
        .from('video_generations')
        .update({ 
            video_url: videoUrl, 
            status: status, // Update the status field as well
            // Optionally clear the error message on success
            error_message: status === 'completed' ? null : errorMsg 
        })
        .eq('id', videoId);

      if (error) {
        console.error('Failed to update video in database:', error);
      } else {
         // Force a refresh of the specific video in the local state to ensure consistency
        setVideos(prev => prev.map(v => 
            v.id === videoId 
            ? { ...v, video_url: videoUrl, status, progress: 100 } 
            : v
        ));
      }
    } catch (error) {
      console.error('Error updating video URL:', error);
    }
  }, []);

  // Check status of pending/processing videos
  const checkPendingVideos = useCallback(async () => {
    // This is a snapshot of videos that need checking right now.
    const videosToCheck = videos.filter(video => 
        (video.status === 'pending' || video.status === 'processing' || video.status === 'running') &&
        !checkingStatus.has(video.id) // Don't check if already in flight
    );

    if (videosToCheck.length === 0) return;

    // Use Promise.all to check statuses in parallel for efficiency
    await Promise.all(videosToCheck.map(async (video) => {
      // Mark as checking
      setCheckingStatus(prev => new Set(prev).add(video.id));
      
      try {
        const statusResponse = await checkVideoStatus(video.video_id);
        
        // Update local state immediately for better UX
        setVideos(prev => prev.map(v => 
          v.id === video.id 
            ? { ...v, status: statusResponse.status, progress: statusResponse.progress } 
            : v
        ));

        // If completed or failed, update the database
        if (statusResponse.status === 'completed' && statusResponse.video_url) {
            await updateVideoInDatabase(video.id, statusResponse.video_url, 'completed');
            
            // Request permission and show notification
            const permissionGranted = await requestNotificationPermission();
            if(permissionGranted) {
                showVideoCompleteNotification(`Video "${video.message.substring(0, 30)}..."`);
            } else {
                toast.success(`Video "${video.message.substring(0, 30)}..." is ready!`);
            }
        } else if (statusResponse.status === 'failed') {
            await updateVideoInDatabase(video.id, video.video_url, 'failed', statusResponse.error);
            toast.error(`Video generation failed: ${statusResponse.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error(`Error checking status for video ${video.id}:`, error);
      } finally {
        // Unmark as checking
        setCheckingStatus(prev => {
          const newSet = new Set(prev);
          newSet.delete(video.id);
          return newSet;
        });
      }
    }));
  }, [videos, checkingStatus, updateVideoInDatabase]);

  useEffect(() => {
    if (user) {
      fetchVideos();
      
      // Clear any existing interval before setting a new one
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      
      // Set up periodic status checking
      pollingIntervalRef.current = setInterval(checkPendingVideos, 10000); // Check every 10 seconds

      // Cleanup on unmount
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    }
  }, [user, fetchVideos, checkPendingVideos]);


  // Extract storage path from Supabase URL
  const extractStoragePath = (url: string): string | undefined => {
    if (!url || !url.includes('supabase.co/storage/v1/object/public/generated-videos/')) {
      return undefined;
    }
    const parts = url.split('/generated-videos/');
    return parts[1];
  };

  // Filter videos based on search and type
  const filteredVideos = videos.filter(video => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
        video.message.toLowerCase().includes(searchLower) ||
        video.video_type.toLowerCase().includes(searchLower) ||
        (video.recipient_name && video.recipient_name.toLowerCase().includes(searchLower)) ||
        (video.company_name && video.company_name.toLowerCase().includes(searchLower));
    
    const matchesType = selectedType === 'all' || video.video_type === selectedType;
    return matchesSearch && matchesType;
  });

  const videoTypes = ['all', ...Array.from(new Set(videos.map(video => video.video_type)))];

  const handleDelete = async (videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    if (!video || !user) return;

    setDeletingVideos(prev => new Set(prev).add(videoId));

    try {
        if (video.storage_path) {
            await deleteVideoFromSupabase(video.storage_path);
        }
        const { error: dbError } = await supabase
            .from('video_generations')
            .delete()
            .eq('id', videoId)
            .eq('user_id', user.id);

        if (dbError) throw new Error(dbError.message);

        setVideos(prev => prev.filter(v => v.id !== videoId));
        setSelectedVideos(prev => {
            const newSet = new Set(prev);
            newSet.delete(videoId);
            return newSet;
        });
        toast.success('Video deleted successfully');
    } catch (error: any) {
        toast.error(`Failed to delete video: ${error.message}`);
        // Force refresh on error to maintain consistency
        fetchVideos(false);
    } finally {
        setDeletingVideos(prev => {
            const newSet = new Set(prev);
            newSet.delete(videoId);
            return newSet;
        });
    }
  };
  
  // Omitted other handlers for brevity (handleDownload, handleBulkDelete, etc.)
  // They would remain the same as your original code.
  
  const getStatusDisplay = (video: StoredVideo) => {
    // ... same as your original getStatusDisplay function
    // This function is well-written and doesn't need changes.
  };

  if (!user) {
    return <div>Please sign in to view your library.</div>;
  }
  
  return (
    <div>
      {/* Omitted the JSX for brevity as the logic was the main focus */}
      {/* The existing JSX structure is great and doesn't need changes. */}
      <h1>Video Library</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {filteredVideos.map(video => (
            <li key={video.id}>
              {video.message} - <strong>{video.status}</strong>
              {video.status === 'processing' && ` (${video.progress || 0}%)`}
              <button onClick={() => handleDelete(video.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
