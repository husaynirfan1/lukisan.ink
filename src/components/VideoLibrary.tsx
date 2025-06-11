import React, { useState, useEffect, useRef } from 'react';
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
import { 
  downloadVideoFromSupabase, 
  deleteVideoFromSupabase, 
  updateVideoUrlInDatabase,
  getPendingVideos
} from '../lib/videoStorage';
import { checkVideoStatus, type TaskStatusResponse } from '../lib/piapi';
import toast from 'react-hot-toast';

interface StoredVideo {
  id: string;
  user_id: string;
  video_type: string;
  message: string;
  recipient_name?: string;
  company_name?: string;
  video_id: string;
  video_url: string;
  logo_url?: string;
  created_at: string;
  storage_path?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
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
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const userTier = getUserTier();
  const isProUser = userTier === 'pro';

  useEffect(() => {
    if (user) {
      fetchVideos();
      
      // Set up periodic status checking for pending/processing videos
      statusCheckIntervalRef.current = setInterval(checkPendingVideos, 10000); // Check every 10 seconds
      
      return () => {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
        }
      };
    }
  }, [user]);

  const fetchVideos = async (showLoading = true) => {
    if (!user) return;

    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      console.log('Fetching videos for user:', user.id);
      
      const { data, error } = await supabase
        .from('video_generations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching videos:', error);
        toast.error('Failed to load video library');
        return;
      }

      console.log('Fetched videos from database:', data?.length || 0);

      // Add storage path extraction and determine status
      const videosWithStatus = (data || []).map(video => {
        const storagePath = extractStoragePath(video.video_url);
        let status: 'pending' | 'processing' | 'completed' | 'failed' = 'completed';
        
        // If video_url is empty or just a task ID, it's still processing
        if (!video.video_url || video.video_url === video.video_id || video.video_url === '') {
          status = 'processing';
        } else if (video.video_url.startsWith('http')) {
          status = 'completed';
        }

        return {
          ...video,
          storage_path: storagePath,
          status,
          progress: status === 'completed' ? 100 : 0
        };
      });

      setVideos(videosWithStatus);
      console.log('Updated local state with videos:', videosWithStatus.length);
      
      // Check for pending videos immediately
      const pendingVideos = videosWithStatus.filter(v => 
        v.status === 'pending' || v.status === 'processing'
      );
      
      if (pendingVideos.length > 0) {
        console.log(`Found ${pendingVideos.length} pending videos, checking status...`);
        setTimeout(() => checkPendingVideos(), 1000);
      }
      
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast.error('Failed to load video library');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Check status of pending/processing videos
  const checkPendingVideos = async () => {
    if (!user) return;
    
    const pendingVideos = videos.filter(video => 
      (video.status === 'pending' || video.status === 'processing') && 
      video.video_id && 
      !checkingStatus.has(video.id)
    );

    if (pendingVideos.length === 0) return;

    console.log(`Checking status for ${pendingVideos.length} pending videos`);

    for (const video of pendingVideos) {
      if (checkingStatus.has(video.id)) continue; // Skip if already checking

      try {
        setCheckingStatus(prev => new Set([...prev, video.id]));
        
        const statusResponse = await checkVideoStatus(video.video_id);
        console.log(`Status for video ${video.id} (task ${video.video_id}):`, statusResponse);
        
        // Update video status in state
        setVideos(prev => prev.map(v => {
          if (v.id === video.id) {
            return {
              ...v,
              status: statusResponse.status,
              progress: statusResponse.progress || 0,
              error: statusResponse.error
            };
          }
          return v;
        }));

        // If completed, update database with video URL
        if (statusResponse.status === 'completed' && statusResponse.video_url) {
          const videoUrl = statusResponse.video_url;
          
          // Update database
          const updated = await updateVideoUrlInDatabase(video.video_id, videoUrl);
          
          if (updated) {
            console.log(`Updated video ${video.id} with URL: ${videoUrl}`);
            
            // Update local state
            setVideos(prev => prev.map(v => {
              if (v.id === video.id) {
                return {
                  ...v,
                  video_url: videoUrl,
                  status: 'completed',
                  progress: 100
                };
              }
              return v;
            }));
            
            // Show notification
            toast.success(`Video "${video.message.substring(0, 30)}..." is ready for download!`, {
              duration: 5000,
              icon: '🎬'
            });
          }
        } else if (statusResponse.status === 'failed') {
          toast.error(`Video generation failed: ${statusResponse.error || 'Unknown error'}`);
          
          // Update database to mark as failed
          await supabase
            .from('video_generations')
            .update({ 
              video_url: 'failed',
              storage_path: `error: ${statusResponse.error || 'Unknown error'}`
            })
            .eq('id', video.id);
        }

      } catch (error) {
        console.error(`Error checking status for video ${video.id}:`, error);
      } finally {
        setCheckingStatus(prev => {
          const newSet = new Set(prev);
          newSet.delete(video.id);
          return newSet;
        });
      }
    }
  };

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
    const matchesSearch = video.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         video.video_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (video.recipient_name && video.recipient_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (video.company_name && video.company_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = selectedType === 'all' || video.video_type === selectedType;
    
    return matchesSearch && matchesType;
  });

  // Get unique video types
  const videoTypes = ['all', ...Array.from(new Set(videos.map(video => video.video_type)))];

  const handleDownload = async (video: StoredVideo) => {
    if (video.status !== 'completed' || !video.video_url || video.video_url === video.video_id || video.video_url === '') {
      toast.error('Video is not ready for download yet');
      return;
    }

    try {
      const filename = `video-${video.video_type}-${Date.now()}.mp4`;
      
      if (video.video_url.includes('supabase.co')) {
        await downloadVideoFromSupabase(video.video_url, filename);
        toast.success('High-quality video downloaded!');
      } else {
        // Fallback for external URLs
        const link = document.createElement('a');
        link.href = video.video_url;
        link.download = filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Video downloaded!');
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download video');
    }
  };

  const handleDelete = async (videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    if (!video) {
      console.error('Video not found for deletion:', videoId);
      toast.error('Video not found');
      return;
    }

    console.log('=== STARTING VIDEO DELETION ===');
    console.log('Video ID:', videoId);
    console.log('Video URL:', video.video_url);
    console.log('Storage Path:', video.storage_path);

    setDeletingVideos(prev => new Set([...prev, videoId]));

    try {
      // Step 1: Delete from storage if it's a Supabase URL
      if (video.storage_path) {
        console.log('Deleting from storage:', video.storage_path);
        try {
          await deleteVideoFromSupabase(video.storage_path);
          console.log('✓ Storage deletion successful');
        } catch (storageError) {
          console.warn('⚠ Storage deletion failed (continuing):', storageError);
          // Don't fail the whole operation if storage deletion fails
        }
      } else {
        console.log('Skipping storage deletion (not a Supabase URL)');
      }

      // Step 2: Delete from database
      console.log('Deleting from database');
      
      const { error: dbError } = await supabase
        .from('video_generations')
        .delete()
        .eq('id', videoId)
        .eq('user_id', user.id);

      if (dbError) {
        console.error('✗ Database deletion error:', dbError);
        throw new Error(`Database deletion failed: ${dbError.message}`);
      }

      console.log('✓ Database deletion completed successfully');

      // Step 3: Update local state
      console.log('Updating local state');
      setVideos(prev => {
        const newVideos = prev.filter(v => v.id !== videoId);
        console.log('Local state updated:', prev.length, '->', newVideos.length);
        return newVideos;
      });

      // Clear from selected videos
      setSelectedVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(videoId);
        return newSet;
      });

      console.log('=== VIDEO DELETION COMPLETED SUCCESSFULLY ===');
      toast.success('Video deleted successfully');

    } catch (error: any) {
      console.error('=== VIDEO DELETION FAILED ===');
      console.error('Error details:', error);
      
      toast.error(`Failed to delete video: ${error.message}`);
      
      // Force refresh to ensure UI consistency
      console.log('Forcing refresh due to deletion error');
      setTimeout(() => {
        fetchVideos(false);
      }, 1000);
    } finally {
      setDeletingVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(videoId);
        return newSet;
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedVideos.size === 0) return;

    const confirmed = window.confirm(`Are you sure you want to delete ${selectedVideos.size} video(s)?`);
    if (!confirmed) return;

    console.log('=== STARTING BULK VIDEO DELETION ===');
    console.log('Videos to delete:', Array.from(selectedVideos));
    
    // Process deletions sequentially to avoid overwhelming the database
    const videosToDelete = Array.from(selectedVideos);
    let successCount = 0;
    let failCount = 0;

    for (const videoId of videosToDelete) {
      try {
        await handleDelete(videoId);
        successCount++;
      } catch (error) {
        console.error(`Bulk delete failed for ${videoId}:`, error);
        failCount++;
      }
    }
    
    setSelectedVideos(new Set());
    
    if (failCount === 0) {
      toast.success(`Successfully deleted ${successCount} video(s)`);
    } else {
      toast.error(`Deleted ${successCount} video(s), ${failCount} failed`);
      // Force refresh to ensure consistency
      setTimeout(() => {
        fetchVideos(false);
      }, 1000);
    }
    
    console.log('=== BULK VIDEO DELETION COMPLETED ===');
    console.log(`Successful: ${successCount}, Failed: ${failCount}`);
  };

  const toggleVideoSelection = (videoId: string) => {
    setSelectedVideos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(videoId)) {
        newSet.delete(videoId);
      } else {
        newSet.add(videoId);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    const visibleIds = filteredVideos.map(video => video.id);
    setSelectedVideos(new Set(visibleIds));
  };

  const clearSelection = () => {
    setSelectedVideos(new Set());
  };

  // Manual refresh function
  const handleRefresh = () => {
    console.log('Manual refresh triggered');
    fetchVideos(false);
    checkPendingVideos();
    toast.success('Library refreshed');
  };

  const toggleVideoPlay = (videoId: string) => {
    setPlayingVideo(prev => prev === videoId ? null : videoId);
  };

  // Manual status check for a specific video
  const handleManualStatusCheck = async (video: StoredVideo) => {
    if (checkingStatus.has(video.id)) return;

    setCheckingStatus(prev => new Set([...prev, video.id]));
    
    try {
      toast.loading(`Checking status for "${video.message.substring(0, 20)}..."`, {
        id: `status-check-${video.id}`
      });
      
      const statusResponse = await checkVideoStatus(video.video_id);
      
      // Update video status
      setVideos(prev => prev.map(v => {
        if (v.id === video.id) {
          return {
            ...v,
            status: statusResponse.status,
            progress: statusResponse.progress || 0,
            error: statusResponse.error
          };
        }
        return v;
      }));

      // If completed, update database
      if (statusResponse.status === 'completed' && statusResponse.video_url) {
        const videoUrl = statusResponse.video_url;
        
        // Update database
        const updated = await updateVideoUrlInDatabase(video.video_id, videoUrl);
        
        if (updated) {
          console.log(`Updated video ${video.id} with URL: ${videoUrl}`);
          
          // Update local state
          setVideos(prev => prev.map(v => {
            if (v.id === video.id) {
              return {
                ...v,
                video_url: videoUrl,
                status: 'completed',
                progress: 100
              };
            }
            return v;
          }));
          
          toast.success('Video is now ready for download!', {
            id: `status-check-${video.id}`
          });
        } else {
          toast.error('Failed to update video status in database', {
            id: `status-check-${video.id}`
          });
        }
      } else if (statusResponse.status === 'failed') {
        toast.error(`Video generation failed: ${statusResponse.error || 'Unknown error'}`, {
          id: `status-check-${video.id}`
        });
      } else {
        toast.success(`Video status: ${statusResponse.status} (${statusResponse.progress || 0}% complete)`, {
          id: `status-check-${video.id}`
        });
      }

    } catch (error: any) {
      console.error('Error checking video status:', error);
      toast.error(`Failed to check video status: ${error.message}`, {
        id: `status-check-${video.id}`
      });
    } finally {
      setCheckingStatus(prev => {
        const newSet = new Set(prev);
        newSet.delete(video.id);
        return newSet;
      });
    }
  };

  // Get status icon and color
  const getStatusDisplay = (video: StoredVideo) => {
    const isChecking = checkingStatus.has(video.id);
    
    if (isChecking) {
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
          icon: <CheckCircle className="h-4 w-4" />,
          color: 'text-green-600',
          bg: 'bg-green-100',
          text: 'Ready'
        };
    }
  };

  // Check if video is ready for download
  const isVideoReady = (video: StoredVideo): boolean => {
    return video.status === 'completed' && 
           !!video.video_url && 
           video.video_url !== video.video_id && 
           video.video_url !== '';
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Generated Video Library</h2>
          <p className="text-gray-600">Sign in to view your generated videos</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
              <Video className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Generated Video Library</h1>
              <p className="text-gray-600">
                Track your video generation progress and download completed videos
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Refresh button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm">Refresh</span>
            </motion.button>
            
            {!isProUser && (
              <div className="flex items-center space-x-2 px-4 py-2 bg-orange-100 text-orange-800 rounded-lg">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">Auto-delete in 2h</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Video className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Videos</p>
                <p className="text-xl font-bold text-gray-900">{videos.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Ready</p>
                <p className="text-xl font-bold text-gray-900">
                  {videos.filter(v => isVideoReady(v)).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Loader2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Processing</p>
                <p className="text-xl font-bold text-gray-900">
                  {videos.filter(v => v.status === 'processing' || v.status === 'pending').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Failed</p>
                <p className="text-xl font-bold text-gray-900">
                  {videos.filter(v => v.status === 'failed').length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search videos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none bg-white"
              >
                {videoTypes.map(type => (
                  <option key={type} value={type}>
                    {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* View Mode and Actions */}
          <div className="flex items-center space-x-4">
            {selectedVideos.size > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">{selectedVideos.size} selected</span>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center space-x-1 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors text-sm"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Delete</span>
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <button
                onClick={selectAllVisible}
                className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg transition-colors text-sm"
              >
                Select All
              </button>
              
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                  }`}
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                  }`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          <span className="ml-2 text-gray-600">Loading your videos...</span>
        </div>
      ) : filteredVideos.length === 0 ? (
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
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredVideos.map((video, index) => {
                const isSelected = selectedVideos.has(video.id);
                const isDeleting = deletingVideos.has(video.id);
                const isHighQuality = video.video_url && video.video_url.includes('supabase.co');
                const isPlaying = playingVideo === video.id;
                const statusDisplay = getStatusDisplay(video);
                const canDownload = isVideoReady(video);
                const isChecking = checkingStatus.has(video.id);

                return (
                  <motion.div
                    key={video.id}
                    id={`video-${video.video_id}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                    className={`bg-white rounded-xl shadow-md overflow-hidden border-2 transition-all duration-200 ${
                      isSelected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-transparent'
                    } ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {/* Video Preview */}
                    <div className="relative aspect-video bg-gray-900">
                      {canDownload ? (
                        <video
                          src={video.video_url}
                          className="w-full h-full object-cover"
                          muted
                          loop
                          playsInline
                          ref={(el) => {
                            if (el) {
                              if (isPlaying) {
                                el.play().catch(console.error);
                              } else {
                                el.pause();
                              }
                            }
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                          <div className="text-center">
                            {video.status === 'processing' || video.status === 'pending' ? (
                              <>
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400 mx-auto mb-2" />
                                <p className="text-sm text-gray-300">
                                  {video.status === 'processing' ? 'Processing...' : 'Pending...'}
                                </p>
                                {video.progress > 0 && (
                                  <div className="mt-2 w-32 mx-auto">
                                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-purple-500 rounded-full" 
                                        style={{ width: `${video.progress}%` }}
                                      ></div>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">{video.progress}%</p>
                                  </div>
                                )}
                              </>
                            ) : video.status === 'failed' ? (
                              <>
                                <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                                <p className="text-sm text-gray-300">Generation Failed</p>
                                {video.error && (
                                  <p className="text-xs text-red-400 mt-1 max-w-xs mx-auto">
                                    {video.error}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                <Video className="h-8 w-8 text-gray-500 mx-auto mb-2" />
                                <p className="text-sm text-gray-300">Video Not Available</p>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Play/Pause overlay for completed videos */}
                      {canDownload && (
                        <div 
                          className="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center"
                          onClick={() => toggleVideoPlay(video.id)}
                        >
                          {isPlaying ? (
                            <Pause className="h-12 w-12 text-white" />
                          ) : (
                            <Play className="h-12 w-12 text-white" />
                          )}
                        </div>
                      )}

                      {/* Selection overlay */}
                      <div 
                        className="absolute top-2 left-2 w-6 h-6 rounded border-2 border-white bg-black/20 flex items-center justify-center cursor-pointer"
                        onClick={() => toggleVideoSelection(video.id)}
                      >
                        {isSelected && <span className="text-white text-xs">✓</span>}
                      </div>

                      {/* Status badges */}
                      <div className="absolute top-2 right-2 flex flex-col space-y-1">
                        {/* Status badge */}
                        <div className={`flex items-center space-x-1 px-2 py-1 ${statusDisplay.bg} ${statusDisplay.color} rounded-full text-xs`}>
                          {statusDisplay.icon}
                          <span>{statusDisplay.text}</span>
                        </div>
                        
                        {/* Quality badge */}
                        {isHighQuality && (
                          <div className="flex items-center space-x-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                            <Cloud className="h-3 w-3" />
                            <span>HQ</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <div className="mb-3">
                        <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                          {video.message.length > 60 ? `${video.message.substring(0, 60)}...` : video.message}
                        </h3>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 capitalize">{video.video_type}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(video.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {video.recipient_name && (
                          <p className="text-xs text-gray-500 mt-1">For: {video.recipient_name}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex space-x-2">
                        {video.status === 'processing' || video.status === 'pending' ? (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleManualStatusCheck(video)}
                            disabled={isChecking || isDeleting}
                            className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isChecking ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            <span>Check Status</span>
                          </motion.button>
                        ) : (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleDownload(video)}
                            disabled={!canDownload || isDeleting}
                            className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Download className="h-3 w-3" />
                            <span>Download</span>
                          </motion.button>
                        )}
                        
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleDelete(video.id)}
                          disabled={isDeleting}
                          className="flex items-center justify-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 overflow-hidden">
              <div className="divide-y divide-gray-200">
                {filteredVideos.map((video, index) => {
                  const isSelected = selectedVideos.has(video.id);
                  const isDeleting = deletingVideos.has(video.id);
                  const isHighQuality = video.video_url && video.video_url.includes('supabase.co');
                  const statusDisplay = getStatusDisplay(video);
                  const canDownload = isVideoReady(video);
                  const isChecking = checkingStatus.has(video.id);

                  return (
                    <motion.div
                      key={video.id}
                      id={`video-${video.video_id}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: index * 0.02 }}
                      className={`p-4 hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-purple-50' : ''
                      } ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <div className="flex items-center space-x-4">
                        {/* Selection checkbox */}
                        <button
                          onClick={() => toggleVideoSelection(video.id)}
                          className={`w-5 h-5 rounded border-2 ${
                            isSelected 
                              ? 'bg-purple-500 border-purple-500' 
                              : 'border-gray-300 hover:border-purple-400'
                          } flex items-center justify-center transition-colors`}
                        >
                          {isSelected && <span className="text-white text-xs">✓</span>}
                        </button>

                        {/* Video thumbnail */}
                        <div className="w-24 h-16 bg-gray-900 rounded-lg overflow-hidden flex-shrink-0">
                          {canDownload ? (
                            <video
                              src={video.video_url}
                              className="w-full h-full object-cover"
                              muted
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {video.status === 'processing' || video.status === 'pending' ? (
                                <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                              ) : video.status === 'failed' ? (
                                <XCircle className="h-5 w-5 text-red-500" />
                              ) : (
                                <Video className="h-5 w-5 text-gray-500" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate">{video.message}</h3>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-sm text-gray-600 capitalize">{video.video_type}</span>
                            <span className="text-sm text-gray-500">
                              {new Date(video.created_at).toLocaleDateString()}
                            </span>
                            
                            {/* Status badges */}
                            <div className="flex items-center space-x-2">
                              {/* Status badge */}
                              <div className={`flex items-center space-x-1 px-2 py-1 ${statusDisplay.bg} ${statusDisplay.color} rounded-full text-xs`}>
                                {statusDisplay.icon}
                                <span>{statusDisplay.text}</span>
                              </div>
                              
                              {/* Quality badge */}
                              {isHighQuality && (
                                <div className="flex items-center space-x-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                                  <Cloud className="h-3 w-3" />
                                  <span>HQ</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {video.recipient_name && (
                            <p className="text-sm text-gray-500 mt-1">For: {video.recipient_name}</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-2">
                          {video.status === 'processing' || video.status === 'pending' ? (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleManualStatusCheck(video)}
                              disabled={isChecking || isDeleting}
                              className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isChecking ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              <span>Check Status</span>
                            </motion.button>
                          ) : (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleDownload(video)}
                              disabled={!canDownload || isDeleting}
                              className="flex items-center space-x-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Download className="h-3 w-3" />
                              <span>Download</span>
                            </motion.button>
                          )}
                          
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleDelete(video.id)}
                            disabled={isDeleting}
                            className="flex items-center justify-center p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};