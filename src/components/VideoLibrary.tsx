import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, Download, Trash2, Clock, Crown, Calendar, Search, Filter, 
  Grid3X3, List, AlertTriangle, Loader2, Cloud, ExternalLink, 
  RefreshCw, Play, Pause, CheckCircle, XCircle, RotateCcw, 
  HardDrive, Wifi, WifiOff, Database, Shield, Eye, EyeOff
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { downloadVideoFromSupabase, deleteVideoFromSupabase } from '../lib/videoStorage';
import { videoStatusManager } from '../lib/videoStatusManager';
import { checkVideoStatus } from '../lib/piapi';
import toast from 'react-hot-toast';

// This interface should match the structure of your 'video_generations' table
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
  status?: 'pending' | 'processing' | 'running' | 'downloading' | 'storing' | 'completed' | 'failed';
  progress?: number;
  download_progress?: number;
  storage_progress?: number;
  file_size?: number;
  error_message?: string;
  integrity_verified?: boolean;
}

interface VideoCardProps {
  video: StoredVideo;
  onDelete: (videoId: string) => void;
  onRetry: (video: StoredVideo) => void;
  onCheckStatus: (video: StoredVideo) => void;
  isDeleting: boolean;
  isRetrying: boolean;
  isCheckingStatus: boolean;
}

const VideoCard: React.FC<VideoCardProps> = ({ 
  video, 
  onDelete, 
  onRetry, 
  onCheckStatus,
  isDeleting, 
  isRetrying,
  isCheckingStatus 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewTimeoutRef = useRef<NodeJS.Timeout>();

  const getStatusDisplay = () => {
    const isRetryingThis = isRetrying;
    const isCheckingThis = isCheckingStatus;
    
    if (isCheckingThis) {
      return { 
        icon: <Loader2 className="h-4 w-4 animate-spin" />, 
        color: 'text-blue-600', 
        bg: 'bg-blue-100', 
        text: 'Checking...' 
      };
    }
    
    if (isRetryingThis) {
      return { 
        icon: <Loader2 className="h-4 w-4 animate-spin" />, 
        color: 'text-blue-600', 
        bg: 'bg-blue-100', 
        text: 'Updating...' 
      };
    }
    
    switch (video.status) {
      case 'pending': 
        return { 
          icon: <Clock className="h-4 w-4" />, 
          color: 'text-yellow-600', 
          bg: 'bg-yellow-100', 
          text: 'Pending' 
        };
      case 'processing':
      case 'running':
        return { 
          icon: <Loader2 className="h-4 w-4 animate-spin" />, 
          color: 'text-blue-600', 
          bg: 'bg-blue-100', 
          text: `Processing ${video.progress || 0}%` 
        };
      case 'downloading':
        return { 
          icon: <Download className="h-4 w-4 animate-pulse" />, 
          color: 'text-purple-600', 
          bg: 'bg-purple-100', 
          text: `Downloading ${video.download_progress || 0}%` 
        };
      case 'storing':
        return { 
          icon: <Database className="h-4 w-4 animate-pulse" />, 
          color: 'text-indigo-600', 
          bg: 'bg-indigo-100', 
          text: `Storing ${video.storage_progress || 0}%` 
        };
      case 'completed': 
        return { 
          icon: <CheckCircle className="h-4 w-4" />, 
          color: 'text-green-600', 
          bg: 'bg-green-100', 
          text: 'Ready' 
        };
      case 'failed': 
        return { 
          icon: <XCircle className="h-4 w-4" />, 
          color: 'text-red-600', 
          bg: 'bg-red-100', 
          text: 'Failed' 
        };
      default: 
        return { 
          icon: <Clock className="h-4 w-4" />, 
          color: 'text-gray-500', 
          bg: 'bg-gray-100', 
          text: 'Unknown' 
        };
    }
  };

  const statusDisplay = getStatusDisplay();
  const isProcessing = ['pending', 'processing', 'running', 'downloading', 'storing'].includes(video.status || '');
  const canDownload = video.status === 'completed' && video.video_url && video.video_url !== 'processing' && video.video_url !== null;
  const hasIntegrityIssue = video.status === 'completed' && video.integrity_verified === false;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Handle hover for video preview
  const handleMouseEnter = () => {
    setIsHovered(true);
    if (canDownload && videoRef.current) {
      previewTimeoutRef.current = setTimeout(() => {
        setShowPreview(true);
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(console.error);
          setIsPlaying(true);
        }
      }, 500); // Start preview after 500ms hover
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setShowPreview(false);
    setIsPlaying(false);
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canDownload && videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(console.error);
        setIsPlaying(true);
      }
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canDownload) {
      const filename = `video-${video.video_type}-${Date.now()}.mp4`;
      downloadVideoFromSupabase(video.video_url, filename);
      toast.success('Download started!');
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
      onDelete(video.id);
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRetry(video);
  };

  const handleCheckStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCheckStatus(video);
  };

  return (
    <motion.div
      key={video.id}
      id={`video-${video.video_id}`}
      variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}
      className="bg-white rounded-xl shadow-md overflow-hidden border transition-all duration-200 hover:shadow-lg group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative aspect-video bg-gray-900 cursor-pointer" onClick={handleVideoClick}>
        {canDownload ? (
          <>
            <video 
              ref={videoRef}
              src={video.video_url} 
              className="w-full h-full object-cover" 
              muted 
              loop 
              playsInline 
              poster={video.logo_url}
              style={{ display: showPreview ? 'block' : 'none' }}
            />
            {!showPreview && (
              <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                <img
                  src={video.logo_url || '/api/placeholder/400/225'}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <div className="bg-white/90 rounded-full p-3 group-hover:scale-110 transition-transform">
                    <Play className="h-6 w-6 text-gray-900 ml-1" />
                  </div>
                </div>
              </div>
            )}
            
            {/* Video controls overlay */}
            {showPreview && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleVideoClick}
                      className="bg-white/90 rounded-full p-2 hover:bg-white transition-colors"
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4 text-gray-900" />
                      ) : (
                        <Play className="h-4 w-4 text-gray-900 ml-0.5" />
                      )}
                    </button>
                    <span className="text-white text-sm font-medium">
                      {isPlaying ? 'Playing' : 'Paused'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Eye className="h-4 w-4 text-white" />
                    <span className="text-white text-sm">Preview</span>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
            <div className="text-center p-4">
              <div className={`mx-auto w-12 h-12 flex items-center justify-center rounded-full ${statusDisplay.bg} ${statusDisplay.color}`}>
                {statusDisplay.icon}
              </div>
              <p className={`mt-2 font-medium ${statusDisplay.color}`}>{statusDisplay.text}</p>
              
              {/* Enhanced progress display */}
              {isProcessing && (
                <div className="mt-3 space-y-2">
                  {/* Overall progress */}
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${video.progress || 0}%` }}
                    />
                  </div>
                  
                  {/* File size info */}
                  {video.file_size && (
                    <div className="text-xs text-gray-300">
                      Size: {formatFileSize(video.file_size)}
                    </div>
                  )}
                </div>
              )}
              
              {/* Error message */}
              {video.status === 'failed' && video.error_message && (
                <p className="text-xs text-red-400 mt-1 max-w-xs truncate" title={video.error_message}>
                  {video.error_message}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Status badges */}
        <div className="absolute top-2 left-2 flex space-x-1">
          {video.storage_path && (
            <div className="flex items-center space-x-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
              <Cloud className="h-3 w-3" />
              <span>Stored</span>
            </div>
          )}
          {hasIntegrityIssue && (
            <div className="flex items-center space-x-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
              <AlertTriangle className="h-3 w-3" />
              <span>Integrity Issue</span>
            </div>
          )}
          {video.integrity_verified === true && (
            <div className="flex items-center space-x-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
              <Shield className="h-3 w-3" />
              <span>Verified</span>
            </div>
          )}
        </div>

        {/* Action buttons overlay */}
        <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canDownload && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleDownload}
              className="p-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors shadow-lg"
              title="Download video"
            >
              <Download className="h-4 w-4" />
            </motion.button>
          )}
          
          {isProcessing && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleRetry}
              disabled={isRetrying}
              className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50"
              title="Re-check status"
            >
              <RotateCcw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
            </motion.button>
          )}
          
          {/* New Check Status button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleCheckStatus}
            disabled={isCheckingStatus}
            className="p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors shadow-lg disabled:opacity-50"
            title="Force check status"
          >
            <RefreshCw className={`h-4 w-4 ${isCheckingStatus ? 'animate-spin' : ''}`} />
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors shadow-lg disabled:opacity-50"
            title="Delete video"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </motion.button>
        </div>
      </div>
      
      <div className="p-4">
        <p className="font-semibold text-gray-800 truncate" title={video.message}>
          {video.message}
        </p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm text-gray-500">
            {new Date(video.created_at).toLocaleDateString()} • {video.video_type}
          </p>
          {video.file_size && (
            <p className="text-xs text-gray-400">
              {formatFileSize(video.file_size)}
            </p>
          )}
        </div>
        
        {/* Enhanced status display */}
        <div className="flex items-center justify-between mt-3">
          <div className={`flex items-center space-x-2 text-sm px-3 py-1 rounded-full ${statusDisplay.bg} ${statusDisplay.color}`}>
            {statusDisplay.icon}
            <span>{statusDisplay.text}</span>
          </div>
          
          {/* Quick action buttons for mobile */}
          <div className="flex items-center space-x-2 md:hidden">
            {canDownload && (
              <button 
                onClick={handleDownload}
                className="p-2 text-gray-500 hover:text-green-600 rounded-full hover:bg-gray-100 transition-colors"
                title="Download video"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            
            {isProcessing && (
              <button 
                onClick={handleRetry} 
                disabled={isRetrying} 
                className="p-2 text-gray-500 hover:text-blue-600 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
                title="Re-check status"
              >
                <RotateCcw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              </button>
            )}
            
            {/* Mobile Check Status button */}
            <button 
              onClick={handleCheckStatus} 
              disabled={isCheckingStatus}
              className="p-2 text-gray-500 hover:text-purple-600 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
              title="Force check status"
            >
              <RefreshCw className={`h-4 w-4 ${isCheckingStatus ? 'animate-spin' : ''}`} />
            </button>
            
            <button 
              onClick={handleDelete} 
              disabled={isDeleting}
              className="p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
              title="Delete video"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export function VideoLibrary() {
  const { user, getUserTier } = useAuth();
  const [videos, setVideos] = useState<StoredVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [deletingVideos, setDeletingVideos] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState<Set<string>>(new Set());
  const [checkingAllStatus, setCheckingAllStatus] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    used_space: number;
    total_space: number;
    video_count: number;
  } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('online');
  
  const initialFetchDone = useRef(false);
  const realtimeChannelRef = useRef<any>(null);
  const userTier = getUserTier();
  const isProUser = userTier === 'pro';

  // Monitor connection status
  useEffect(() => {
    const handleOnline = () => setConnectionStatus('online');
    const handleOffline = () => setConnectionStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // FIXED: Improved fetch and monitor videos function with better error handling
  const fetchAndMonitorVideos = useCallback(async (showLoading = true) => {
    if (!user) return;
    if (showLoading) setLoading(true);
    else setRefreshing(true);

    try {
      console.log('[VideoLibrary] Fetching videos for user:', user.id);
      
      const { data, error } = await supabase
        .from('video_generations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[VideoLibrary] Error fetching videos:', error);
        toast.error('Failed to load video library.');
        return;
      }
      
      console.log('[VideoLibrary] Fetched videos:', data?.length || 0);
      
      const fetchedVideos = (data || []).map(video => {
        // Normalize status - treat null/undefined as 'pending'
        const validStatuses = ['pending', 'processing', 'running', 'downloading', 'storing', 'completed', 'failed'];
        let currentStatus = video.status;
        
        if (!currentStatus || !validStatuses.includes(currentStatus)) {
          currentStatus = 'pending';
          console.log(`[VideoLibrary] Normalized status for video ${video.id}: ${video.status} -> pending`);
        }

        return {
            ...video,
            status: currentStatus,
            storage_path: video.video_url ? extractStoragePath(video.video_url) : undefined
        };
      });

      setVideos(fetchedVideos);

      // Calculate storage info
      const totalSize = fetchedVideos.reduce((sum, video) => sum + (video.file_size || 0), 0);
      const completedCount = fetchedVideos.filter(v => v.status === 'completed').length;
      
      setStorageInfo({
        used_space: totalSize,
        total_space: 1024 * 1024 * 1024, // 1GB default
        video_count: completedCount
      });

      // Start monitoring for videos that are still processing
      fetchedVideos.forEach(video => {
        if (['pending', 'processing', 'running', 'downloading', 'storing'].includes(video.status || '')) {
          console.log(`[VideoLibrary] Starting monitoring for video ${video.id} with status ${video.status}`);
          videoStatusManager.startMonitoring(video.id, video.video_id, user.id);
        }
      });

    } catch (error) {
      console.error('[VideoLibrary] Unexpected error:', error);
      toast.error('An unexpected error occurred while loading videos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // FIXED: Improved component mounting and cleanup
  useEffect(() => {
    if (user && !initialFetchDone.current) {
      initialFetchDone.current = true;
      console.log('[VideoLibrary] Initial fetch starting');
      fetchAndMonitorVideos();

      // Set up real-time subscription for video updates
      console.log('[VideoLibrary] Setting up real-time subscription');
      realtimeChannelRef.current = supabase.channel('video-library-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'video_generations', filter: `user_id=eq.${user.id}` },
          (payload) => {
            console.log('[VideoLibrary] Real-time change detected:', payload);
            // Re-fetch videos when changes are detected
            fetchAndMonitorVideos(false); 
          }
        )
        .subscribe((status) => {
          console.log('[VideoLibrary] Subscription status:', status);
        });
    }
    
    // Cleanup function
    return () => {
      console.log('[VideoLibrary] Component unmounting, cleaning up');
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [user, fetchAndMonitorVideos]);

  // FIXED: Check for task_id in URL state for direct video status viewing
  useEffect(() => {
    // Check if we have a taskId in the history state (from navigation)
    const taskId = window.history.state?.taskId;
    
    if (taskId && videos.length > 0) {
      console.log(`[VideoLibrary] Found taskId in state: ${taskId}, looking for matching video`);
      
      // Find the video with this task_id
      const video = videos.find(v => v.video_id === taskId);
      
      if (video) {
        console.log(`[VideoLibrary] Found video for task ${taskId}: ${video.id}`);
        
        // Scroll to the video element
        setTimeout(() => {
          const videoElement = document.getElementById(`video-${video.id}`);
          if (videoElement) {
            console.log(`[VideoLibrary] Scrolling to video element for task ${taskId}`);
            videoElement.scrollIntoView({ behavior: 'smooth' });
            
            // Add a highlight effect
            videoElement.classList.add('ring-4', 'ring-purple-500', 'ring-opacity-50');
            setTimeout(() => {
              videoElement.classList.remove('ring-4', 'ring-purple-500', 'ring-opacity-50');
            }, 3000);
          }
        }, 500);
      }
    }
  }, [videos]);

  const extractStoragePath = (url: string): string | undefined => {
    if (!url || !url.includes('supabase.co/storage/v1/object/public/generated-videos/')) {
      return undefined;
    }
    const parts = url.split('/generated-videos/');
    return parts.length > 1 ? parts[1] : undefined;
  };

  /**
   * NEW: Force check status of a video directly from PiAPI
   * This function will bypass the normal monitoring system and directly check the status
   */
  const handleForceCheckStatus = async (video: StoredVideo) => {
    if (!user || checkingStatus.has(video.id)) return;
    
    console.log(`[VideoLibrary] Force checking status for video ${video.id}, task ${video.video_id}`);
    const toastId = `status-check-${video.id}`;
    toast.loading('Checking video status...', { id: toastId });
    
    // Add to checking set
    setCheckingStatus(prev => new Set(prev).add(video.id));
    
    try {
      // 1. Directly check status from PiAPI
      const statusResponse = await checkVideoStatus(video.video_id);
      console.log(`[VideoLibrary] Direct status check result:`, statusResponse);
      
      // 2. Update the database with the latest status
      const updateData: any = {
        status: statusResponse.status,
        progress: statusResponse.progress || 0,
        updated_at: new Date().toISOString()
      };
      
      // Add video URL if available
      if (statusResponse.video_url) {
        updateData.video_url = statusResponse.video_url;
      }
      
      // Add error message if available
      if (statusResponse.error) {
        updateData.error_message = statusResponse.error;
      }
      
      // 3. Update the database
      const { error } = await supabase
        .from('video_generations')
        .update(updateData)
        .eq('id', video.id);
      
      if (error) {
        throw new Error(`Database update failed: ${error.message}`);
      }
      
      // 4. If completed, start monitoring to handle the download and storage
      if (statusResponse.status === 'completed' && statusResponse.video_url) {
        videoStatusManager.startMonitoring(video.id, video.video_id, user.id);
      }
      
      // 5. Refresh the video list
      await fetchAndMonitorVideos(false);
      
      // 6. Show success message
      toast.success('Status updated successfully!', { id: toastId });
      
    } catch (error: any) {
      console.error(`[VideoLibrary] Force status check failed:`, error);
      toast.error(`Status check failed: ${error.message}`, { id: toastId });
    } finally {
      // Remove from checking set
      setTimeout(() => {
        setCheckingStatus(prev => {
          const newSet = new Set(prev);
          newSet.delete(video.id);
          return newSet;
        });
      }, 1000);
    }
  };

  /**
   * NEW: Force check status of all processing videos
   */
  const handleCheckAllStatus = async () => {
    if (!user || checkingAllStatus) return;
    
    const processingVideos = videos.filter(v => 
      ['pending', 'processing', 'running'].includes(v.status || '')
    );
    
    if (processingVideos.length === 0) {
      toast.info('No processing videos to check');
      return;
    }
    
    setCheckingAllStatus(true);
    const toastId = 'check-all-status';
    toast.loading(`Checking status of ${processingVideos.length} videos...`, { id: toastId });
    
    try {
      console.log(`[VideoLibrary] Checking status of ${processingVideos.length} videos`);
      
      // Process videos in batches of 3 to avoid overwhelming the API
      const batchSize = 3;
      const batches = Math.ceil(processingVideos.length / batchSize);
      
      for (let i = 0; i < batches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, processingVideos.length);
        const batch = processingVideos.slice(start, end);
        
        // Update toast with progress
        toast.loading(`Checking videos ${start + 1}-${end} of ${processingVideos.length}...`, { id: toastId });
        
        // Process batch in parallel
        await Promise.all(batch.map(async (video) => {
          try {
            // Add to checking set
            setCheckingStatus(prev => new Set(prev).add(video.id));
            
            // Check status
            const statusResponse = await checkVideoStatus(video.video_id);
            
            // Update database
            const updateData: any = {
              status: statusResponse.status,
              progress: statusResponse.progress || 0,
              updated_at: new Date().toISOString()
            };
            
            if (statusResponse.video_url) {
              updateData.video_url = statusResponse.video_url;
            }
            
            if (statusResponse.error) {
              updateData.error_message = statusResponse.error;
            }
            
            await supabase
              .from('video_generations')
              .update(updateData)
              .eq('id', video.id);
            
            // If completed, start monitoring
            if (statusResponse.status === 'completed' && statusResponse.video_url) {
              videoStatusManager.startMonitoring(video.id, video.video_id, user.id);
            }
            
          } catch (error) {
            console.error(`[VideoLibrary] Error checking video ${video.id}:`, error);
          } finally {
            // Remove from checking set
            setCheckingStatus(prev => {
              const newSet = new Set(prev);
              newSet.delete(video.id);
              return newSet;
            });
          }
        }));
        
        // Add a small delay between batches
        if (i < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Refresh the video list
      await fetchAndMonitorVideos(false);
      
      toast.success(`Status check completed for ${processingVideos.length} videos`, { id: toastId });
    } catch (error: any) {
      console.error(`[VideoLibrary] Check all status failed:`, error);
      toast.error(`Status check failed: ${error.message}`, { id: toastId });
    } finally {
      setCheckingAllStatus(false);
    }
  };

  const handleManualRetry = async (video: StoredVideo) => {
    if (!user || checkingStatus.has(video.id)) return;
    
    console.log(`[VideoLibrary] Manual retry for video ${video.id}`);
    toast.loading('Re-checking video status...', { id: video.id });
    setCheckingStatus(prev => new Set(prev).add(video.id));
    
    try {
      await videoStatusManager.manualStatusCheck(video.id, video.video_id, user.id);
      toast.success('Status check completed', { id: video.id });
    } catch (error: any) {
      console.error(`[VideoLibrary] Manual retry failed:`, error);
      toast.error(`Failed to re-check status: ${error.message}`, { id: video.id });
    } finally {
       setTimeout(() => {
         setCheckingStatus(prev => {
           const newSet = new Set(prev);
           newSet.delete(video.id);
           return newSet;
         });
       }, 2000);
    }
  };
  
  const handleDelete = async (videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    if (!video || !user) return;

    setDeletingVideos(prev => new Set(prev).add(videoId));
    try {
      // Stop monitoring if it's active
      videoStatusManager.stopMonitoring(videoId);
      
      if (video.storage_path) {
        await deleteVideoFromSupabase(video.storage_path);
      }
      const { error: dbError } = await supabase
        .from('video_generations')
        .delete()
        .eq('id', videoId)
        .eq('user_id', user.id);
      if (dbError) throw new Error(dbError.message);
      toast.success('Video deleted successfully');
      setVideos(prev => prev.filter(v => v.id !== videoId));
      
      // Update storage info
      const deletedVideo = videos.find(v => v.id === videoId);
      if (deletedVideo && storageInfo) {
        setStorageInfo(prev => prev ? {
          ...prev,
          used_space: prev.used_space - (deletedVideo.file_size || 0),
          video_count: prev.video_count - 1
        } : null);
      }
    } catch (error: any) {
      toast.error(`Failed to delete video: ${error.message}`);
    } finally {
      setDeletingVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(videoId);
        return newSet;
      });
    }
  };

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

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        <span className="ml-3 text-gray-600 text-lg">Loading your video library...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Video Library</h1>
            <p className="text-gray-600">Track and manage your generated videos.</p>
          </div>
          
          {/* Connection status indicator */}
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
            connectionStatus === 'online' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {connectionStatus === 'online' ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
            <span>{connectionStatus === 'online' ? 'Online' : 'Offline'}</span>
          </div>
        </div>
        
        {/* Storage info */}
        {storageInfo && (
          <div className="mt-4 bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <HardDrive className="h-5 w-5 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">Storage Usage</span>
                </div>
                <div className="text-sm text-gray-600">
                  {formatBytes(storageInfo.used_space)} / {formatBytes(storageInfo.total_space)} used
                </div>
                <div className="text-sm text-gray-600">
                  {storageInfo.video_count} videos
                </div>
              </div>
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min(100, (storageInfo.used_space / storageInfo.total_space) * 100)}%` 
                  }}
                />
              </div>
            </div>
          </div>
        )}
        
        {/* Debug info in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-2 text-xs text-gray-500 bg-gray-100 p-2 rounded">
            Active monitoring: {videoStatusManager.getMonitoringStatus().activeVideos.length} videos
          </div>
        )}
      </div>
      
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-gray-200/50 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search videos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {videoTypes.map(type => (
                <option key={type} value={type}>
                  {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
            
            {/* NEW: Check All Status Button */}
            <button
              onClick={handleCheckAllStatus}
              disabled={checkingAllStatus || videos.filter(v => ['pending', 'processing', 'running'].includes(v.status || '')).length === 0}
              className="flex items-center space-x-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${checkingAllStatus ? 'animate-spin' : ''}`} />
              <span>Check All Status</span>
            </button>
            
            <button
              onClick={() => fetchAndMonitorVideos(false)}
              disabled={refreshing}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {filteredVideos.length === 0 ? (
        <div className="text-center py-12">
          <Video className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {videos.length === 0 ? 'No videos yet' : 'No videos match your search'}
          </h3>
          <p className="text-gray-600 mb-6">
            {videos.length === 0 
              ? 'Generate your first video to see it here' 
              : 'Try adjusting your search terms or filters'
            }
          </p>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            initial="hidden" 
            animate="visible" 
            variants={{
              visible: { transition: { staggerChildren: 0.05 } }
            }}
          >
            {filteredVideos.map((video) => (
              <VideoCard
  key={video.id}
  video={video}
  onDelete={handleDelete}
  // CHANGE THIS LINE:
  onRetry={handleForceCheckStatus} // Use the robust handler instead of handleManualRetry
  onCheckStatus={handleForceCheckStatus}
  isDeleting={deletingVideos.has(video.id)}
  // CHANGE THIS LINE:
  isRetrying={checkingStatus.has(video.id)} // Use the same state for both buttons
  isCheckingStatus={checkingStatus.has(video.id)}
/>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}