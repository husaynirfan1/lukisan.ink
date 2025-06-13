import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, Download, Trash2, Clock, Calendar, Search, Filter, 
  Grid3X3, List, AlertTriangle, Loader2, Cloud, RefreshCw, 
  Play, Pause, CheckCircle, XCircle, RotateCcw, HardDrive, 
  Wifi, WifiOff, Database, Shield, Eye, EyeOff, Info
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { videoLibraryService, VideoRecord, VideoFilter } from '../../lib/videoLibraryService';
import { videoProcessingService } from '../../lib/videoProcessingService';
import toast from 'react-hot-toast';

interface VideoCardProps {
  video: VideoRecord;
  onDelete: (videoId: string) => void;
  onRetry: (videoId: string) => void;
  isDeleting: boolean;
  isRetrying: boolean;
}

const VideoCard: React.FC<VideoCardProps> = ({ 
  video, 
  onDelete, 
  onRetry, 
  isDeleting, 
  isRetrying 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewTimeoutRef = useRef<NodeJS.Timeout>();
  const [deletingVideos, setDeletingVideos] = useState<Set<string>>(new Set());
  // Define a stable placeholder URL. This will ALWAYS be used for the thumbnail display.
  const FALLBACK_PLACEHOLDER_URL = 'https://placehold.co/400x225/E0E0E0/333333/png?text=Hover+to+Preview'; 

  const getStatusDisplay = () => {
    const isRetryingThis = isRetrying;
    
    if (isRetryingThis) {
      return { 
        icon: <Loader2 className="h-4 w-4 animate-spin" />, 
        color: 'text-blue-600', 
        bg: 'bg-blue-100', 
        text: 'Checking...' 
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
          text: `Downloading` 
        };
      case 'storing':
        return { 
          icon: <Database className="h-4 w-4 animate-pulse" />, 
          color: 'text-indigo-600', 
          bg: 'bg-indigo-100', 
          text: `Storing` 
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
  const isProcessing = ['pending', 'processing', 'downloading', 'storing'].includes(video.status || '');
  const canDownload = video.status === 'completed' && video.video_url;

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
    if (canDownload && video.video_url) {
      const filename = `video-${video.video_type}-${Date.now()}.mp4`;
      videoLibraryService.downloadVideo(video.video_url, filename)
        .then(() => {
          toast.success('Download started!');
        })
        .catch(error => {
          toast.error('Download failed: ' + error.message);
        });
    }
  };

   const handleDelete = async (videoId: string) => {

    setDeletingVideos(prev => new Set(prev).add(videoId));
    try {
      // Stop monitoring if it's active
      videoStatusManager.stopMonitoring(videoId);

      // --- NEW: Invoke Edge Function for deletion ---
      console.log(`[VideoLibrary] Calling Edge Function 'delete-video-and-data' for DB ID: ${videoId}`);
      const toastId = toast.loading('Deleting video...');

      const { data, error: efError } = await supabase.functions.invoke('delete-video-and-data', {
        body: { video_db_id: videoId },
      });

      if (efError) {
        console.error(`[VideoLibrary] Edge function delete error:`, efError);
        throw new Error(efError.message);
      }

      // Edge function response contains 'success', 'message', 'storageDeleted', 'logoDeleted'
      const efResponse = data as { success: boolean; message: string; storageDeleted?: boolean; logoDeleted?: boolean; error?: string };

      if (efResponse.success) {
        toast.success('Video deleted successfully!', { id: toastId });
        console.log(`[VideoLibrary] Edge function reported: ${efResponse.message}. Storage deleted: ${efResponse.storageDeleted}, Logo deleted: ${efResponse.logoDeleted}`);
        // The UI will likely update via Realtime, but we can optimistically remove it too
        setVideos(prev => prev.filter(v => v.id !== videoId));
      } else {
        console.error(`[VideoLibrary] Edge function reported deletion failure:`, efResponse.error || efResponse.message);
        throw new Error(efResponse.error || efResponse.message || 'Deletion failed in Edge Function.');
      }
      // --- END NEW: Invoke Edge Function ---

      // No need for direct supabase.from(...).delete() here, the Edge Function handles it.
      // No need for direct deleteVideoFromSupabase here, the Edge Function handles it.

      // Update storage info (optimistic update, will be corrected by next fetch)
      if (storageInfo) {
        setStorageInfo(prev => prev ? {
          ...prev,
          used_space: prev.used_space - (videoToDelete.file_size || 0),
          video_count: prev.video_count - 1
        } : null);
      }
    } catch (error: any) {
      toast.error(`Failed to delete video: ${error.message}`, { id: toast.loading }); // Use toastId if defined
    } finally {
      setDeletingVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(videoId);
        return newSet;
      });
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRetry(video.id);
  };

  return (
    <motion.div
      key={video.id}
      id={`video-${video.id}`}
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
              src={video.video_url || undefined} 
              className="w-full h-full object-cover" 
              muted 
              loop 
              playsInline 
              poster={FALLBACK_PLACEHOLDER_URL}
              style={{ display: showPreview ? 'block' : 'none' }}
            />
            {!showPreview && (
              <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                <img
                  src={FALLBACK_PLACEHOLDER_URL}
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
              
              {/* Progress display */}
              {isProcessing && (
                <div className="mt-3 space-y-2">
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

        {/* Status badges - REMOVED STORAGE PATH BADGE TO FIX BLINKING ICON */}
        {video.integrity_verified === false && (
          <div className="absolute top-2 left-2">
            <div className="flex items-center space-x-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
              <AlertTriangle className="h-3 w-3" />
              <span>Integrity Issue</span>
            </div>
          </div>
        )}

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
        
        {/* Status display */}
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

export const EnhancedVideoLibrary: React.FC = () => {
  const { user } = useAuth();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [deletingVideos, setDeletingVideos] = useState<Set<string>>(new Set());
  const [checkingStatus, setCheckingStatus] = useState<Set<string>>(new Set());
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('online');
  const [videoStats, setVideoStats] = useState<{
    total: number;
    completed: number;
    processing: number;
    failed: number;
    totalSize: number;
  }>({
    total: 0,
    completed: 0,
    processing: 0,
    failed: 0,
    totalSize: 0
  });
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  
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

  // Initialize video library service
  useEffect(() => {
    if (!user) return;
    
    setLoading(true);
    
    const initializeLibrary = async () => {
      try {
        await videoLibraryService.initialize(user.id);
        setLoading(false);
      } catch (error) {
        console.error('[VideoLibrary] Initialization error:', error);
        toast.error('Failed to load video library');
        setLoading(false);
      }
    };
    
    initializeLibrary();
    
    // Subscribe to video updates
    const unsubscribe = videoLibraryService.subscribe('main-library', (updatedVideos) => {
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
      
      setVideoStats({
        total,
        completed,
        processing,
        failed,
        totalSize
      });
    });
    
    return () => {
      unsubscribe();
      videoLibraryService.cleanup();
    };
  }, [user]);

  // Handle refresh
  const handleRefresh = async () => {
    if (!user || isRefreshing) return;
    
    setIsRefreshing(true);
    
    try {
      await videoLibraryService.fetchVideos(user.id, true);
      toast.success('Video library refreshed');
    } catch (error) {
      console.error('[VideoLibrary] Refresh error:', error);
      toast.error('Failed to refresh video library');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle delete 
  // const handleDelete = async (videoId: string) => {
  //   if (!user) return;
    
  //   setDeletingVideos(prev => new Set(prev).add(videoId));
    
  //   try {
  //     await videoLibraryService.deleteVideo(videoId);
  //     toast.success('Video deleted successfully');
  //   } catch (error) {
  //     console.error('[VideoLibrary] Delete error:', error);
  //     toast.error('Failed to delete video');
  //   } finally {
  //     setDeletingVideos(prev => {
  //       const newSet = new Set(prev);
  //       newSet.delete(videoId);
  //       return newSet;
  //     });
  //   }
  // };

  // Handle retry
  const handleRetry = async (videoId: string) => {
    if (!user || checkingStatus.has(videoId)) return;
    
    setCheckingStatus(prev => new Set(prev).add(videoId));
    
    try {
      await videoProcessingService.forceCheckStatus(videoId);
      toast.success('Status check initiated');
    } catch (error) {
      console.error('[VideoLibrary] Retry error:', error);
      toast.error('Failed to check video status');
    } finally {
      setTimeout(() => {
        setCheckingStatus(prev => {
          const newSet = new Set(prev);
          newSet.delete(videoId);
          return newSet;
        });
      }, 1000);
    }
  };

  // Filter videos
  const filteredVideos = videos.filter(video => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
        video.message.toLowerCase().includes(searchLower) ||
        video.video_type.toLowerCase().includes(searchLower);
    
    const matchesType = selectedType === 'all' || video.video_type === selectedType;
    return matchesSearch && matchesType;
  });

  // Get unique video types
  const videoTypes = ['all', ...Array.from(new Set(videos.map(video => video.video_type)))];

  // Format bytes
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
        <div className="mt-4 bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <HardDrive className="h-5 w-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-900">Storage Usage</span>
              </div>
              <div className="text-sm text-gray-600">
                {formatBytes(videoStats.totalSize)} used
              </div>
              <div className="text-sm text-gray-600">
                {videoStats.completed} videos
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs">
                <Clock className="h-3 w-3" />
                <span>{videoStats.processing} processing</span>
              </div>
              {videoStats.failed > 0 && (
                <div className="flex items-center space-x-2 px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs">
                  <AlertTriangle className="h-3 w-3" />
                  <span>{videoStats.failed} failed</span>
                </div>
              )}
            </div>
          </div>
        </div>
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
          
          <div className="flex items-center space-x-4">
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
            
            <div className="flex items-center space-x-2 border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-purple-100 text-purple-700' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                title="Grid view"
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-purple-100 text-purple-700' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
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
      ) : viewMode === 'grid' ? (
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
                onRetry={handleRetry}
                isDeleting={deletingVideos.has(video.id)}
                isRetrying={checkingStatus.has(video.id)}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="space-y-4">
          {filteredVideos.map((video) => (
            <motion.div
              key={video.id}
              variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}
              className="bg-white rounded-xl shadow-md overflow-hidden border transition-all duration-200 hover:shadow-lg"
            >
              <div className="flex flex-col md:flex-row">
                <div className="md:w-64 h-40 bg-gray-900 relative">
                  {video.status === 'completed' && video.video_url ? (
                    <img
                      src={FALLBACK_PLACEHOLDER_URL}
                      alt="Video thumbnail"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className={`w-12 h-12 flex items-center justify-center rounded-full ${statusDisplay.bg} ${statusDisplay.color}`}>
                        {statusDisplay.icon}
                      </div>
                    </div>
                  )}
                  
                  {/* Progress overlay for processing videos */}
                  {isProcessing && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-2">
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${video.progress || 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-white text-center mt-1">{video.progress || 0}%</p>
                    </div>
                  )}
                </div>
                
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1" title={video.message}>
                        {video.message.length > 100 
                          ? `${video.message.substring(0, 100)}...` 
                          : video.message}
                      </h3>
                      <div className="flex items-center space-x-3 text-sm text-gray-500">
                        <span>{new Date(video.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="capitalize">{video.video_type}</span>
                        {video.file_size && (
                          <>
                            <span>•</span>
                            <span>{formatFileSize(video.file_size)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className={`flex items-center space-x-2 text-sm px-3 py-1 rounded-full ${statusDisplay.bg} ${statusDisplay.color}`}>
                      {statusDisplay.icon}
                      <span>{statusDisplay.text}</span>
                    </div>
                  </div>
                  
                  {/* Error message */}
                  {video.status === 'failed' && video.error_message && (
                    <div className="mt-2 p-2 bg-red-50 rounded-lg">
                      <p className="text-xs text-red-600">{video.error_message}</p>
                    </div>
                  )}
                  
                  <div className="mt-4 flex items-center justify-end space-x-2">
                    {canDownload && (
                      <button
                        onClick={(e) => handleDownload(e)}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                      >
                        <Download className="h-4 w-4" />
                        <span>Download</span>
                      </button>
                    )}
                    
                    {isProcessing && (
                      <button
                        onClick={(e) => handleRetry(e)}
                        disabled={checkingStatus.has(video.id)}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                      >
                        <RotateCcw className={`h-4 w-4 ${checkingStatus.has(video.id) ? 'animate-spin' : ''}`} />
                        <span>Check Status</span>
                      </button>
                    )}
                    
                    <button
                      onClick={(e) => handleDelete(e)}
                      disabled={deletingVideos.has(video.id)}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                    >
                      {deletingVideos.has(video.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      
      {/* Processing Info */}
      {videoStats.processing > 0 && (
        <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center space-x-2 mb-2">
            <Info className="h-5 w-5 text-blue-600" />
            <h3 className="font-medium text-blue-800">Processing Information</h3>
          </div>
          <p className="text-sm text-blue-700 mb-2">
            {videoStats.processing} video{videoStats.processing !== 1 ? 's' : ''} currently processing. 
            The system automatically checks status every 5 seconds and will update when complete.
          </p>
          <p className="text-xs text-blue-600">
            Videos are automatically downloaded and stored in your library when processing is complete.
          </p>
        </div>
      )}
    </div>
  );
};