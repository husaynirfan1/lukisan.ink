import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, 
  Download, 
  Trash2, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  RefreshCw,
  Play,
  Calendar,
  Filter,
  Search
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { videoStatusManager, type VideoStatusUpdate } from '../../lib/videoStatusManager';
import toast from 'react-hot-toast';

interface VideoGeneration {
  id: string;
  user_id: string;
  video_type: string;
  message: string;
  recipient_name?: string;
  company_name?: string;
  video_id: string;
  video_url?: string;
  logo_url?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error_message?: string;
  storage_path?: string;
  task_id?: string;
  created_at: string;
  updated_at?: string;
}

export const VideoLibrary: React.FC = () => {
  const { user } = useAuth();
  const [videos, setVideos] = useState<VideoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [deletingVideos, setDeletingVideos] = useState<Set<string>>(new Set());

  // Fetch videos from database
  const fetchVideos = useCallback(async () => {
    if (!user) return;

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

      console.log('Fetched videos:', data?.length || 0);

      // Process videos and normalize status
      const processedVideos = (data || []).map(video => ({
        ...video,
        // Treat null or unrecognized status as 'pending'
        status: video.status || 'pending'
      }));

      setVideos(processedVideos);

      // Start monitoring for any videos that are still processing
      processedVideos.forEach(video => {
        if ((video.status === 'pending' || video.status === 'processing') && video.task_id) {
          console.log(`Starting monitoring for video ${video.video_id} with task ${video.task_id}`);
          videoStatusManager.startMonitoring(video.video_id, video.task_id, user.id);
        }
      });

    } catch (error) {
      console.error('Error in fetchVideos:', error);
      toast.error('Failed to load video library');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Handle status updates from the monitoring service
  const handleStatusUpdate = useCallback((update: VideoStatusUpdate) => {
    console.log('Received status update:', update);
    
    setVideos(prevVideos => 
      prevVideos.map(video => 
        video.video_id === update.videoId 
          ? { 
              ...video, 
              status: update.status,
              progress: update.progress,
              video_url: update.videoUrl || video.video_url,
              error_message: update.error,
              updated_at: new Date().toISOString()
            }
          : video
      )
    );

    // Show toast notifications for status changes
    if (update.status === 'completed') {
      toast.success('Video generation completed!');
    } else if (update.status === 'failed') {
      toast.error(`Video generation failed: ${update.error || 'Unknown error'}`);
    }
  }, []);

  // Set up real-time subscriptions and monitoring
  useEffect(() => {
    if (!user) return;

    // Initial fetch
    fetchVideos();

    // Set up status update listener
    videoStatusManager.onStatusUpdate(handleStatusUpdate);

    // Set up Supabase realtime subscription
    const channel = supabase
      .channel('video_generations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'video_generations',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Realtime update received:', payload);
          // Refetch data when changes are detected
          fetchVideos();
        }
      )
      .subscribe();

    return () => {
      // Cleanup
      channel.unsubscribe();
      videoStatusManager.cleanup();
    };
  }, [user, fetchVideos, handleStatusUpdate]);

  // Manual retry for stuck videos
  const handleManualRetry = async (video: VideoGeneration) => {
    if (!video.task_id) {
      toast.error('Cannot retry: Missing task ID');
      return;
    }

    try {
      toast.loading('Checking video status...', { id: `retry-${video.id}` });
      
      await videoStatusManager.manualStatusCheck(
        video.video_id, 
        video.task_id, 
        user!.id
      );
      
      toast.success('Status check completed', { id: `retry-${video.id}` });
    } catch (error) {
      console.error('Manual retry failed:', error);
      toast.error('Failed to check status', { id: `retry-${video.id}` });
    }
  };

  // Download video
  const handleDownload = async (video: VideoGeneration) => {
    if (!video.video_url) {
      toast.error('Video not available for download');
      return;
    }

    try {
      const filename = `video-${video.video_type}-${Date.now()}.mp4`;
      
      const response = await fetch(video.video_url, {
        mode: 'cors',
        headers: { 'Accept': 'video/*' },
      });

      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      toast.success('Video downloaded successfully!');
      
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download video');
    }
  };

  // Delete video
  const handleDelete = async (video: VideoGeneration) => {
    const confirmed = window.confirm('Are you sure you want to delete this video?');
    if (!confirmed) return;

    setDeletingVideos(prev => new Set([...prev, video.id]));

    try {
      // Delete from storage if it exists
      if (video.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('generated-videos')
          .remove([video.storage_path]);

        if (storageError) {
          console.warn('Storage deletion failed:', storageError);
        }
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('video_generations')
        .delete()
        .eq('id', video.id)
        .eq('user_id', user!.id);

      if (dbError) {
        throw new Error(`Database deletion failed: ${dbError.message}`);
      }

      // Stop monitoring if active
      videoStatusManager.stopMonitoring(video.video_id);

      // Update local state
      setVideos(prev => prev.filter(v => v.id !== video.id));
      toast.success('Video deleted successfully');

    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete video');
    } finally {
      setDeletingVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(video.id);
        return newSet;
      });
    }
  };

  // Filter videos
  const filteredVideos = videos.filter(video => {
    const matchesSearch = video.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         video.video_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (video.recipient_name && video.recipient_name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = selectedType === 'all' || video.video_type === selectedType;
    const matchesStatus = selectedStatus === 'all' || video.status === selectedStatus;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  // Get status icon and color
  const getStatusDisplay = (video: VideoGeneration) => {
    switch (video.status) {
      case 'completed':
        return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' };
      case 'failed':
        return { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100' };
      case 'processing':
        return { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-100' };
      default:
        return { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100' };
    }
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Video Library</h2>
          <p className="text-gray-600">Sign in to view your generated videos</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
              <Video className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Video Library</h1>
              <p className="text-gray-600">Manage your AI-generated videos</p>
            </div>
          </div>

          <button
            onClick={fetchVideos}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search videos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Type Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="pl-10 pr-8 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">All Types</option>
                <option value="welcome">Welcome Videos</option>
                <option value="marketing">Marketing Videos</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredVideos.map((video, index) => {
              const statusDisplay = getStatusDisplay(video);
              const StatusIcon = statusDisplay.icon;
              const isDeleting = deletingVideos.has(video.id);

              return (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-white rounded-xl shadow-md overflow-hidden border-2 transition-all duration-200 ${
                    isDeleting ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  {/* Video Preview */}
                  <div className="relative aspect-video bg-gray-100">
                    {video.status === 'completed' && video.video_url ? (
                      <video
                        src={video.video_url}
                        className="w-full h-full object-cover"
                        controls={false}
                        muted
                        preload="metadata"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <StatusIcon className={`h-12 w-12 ${statusDisplay.color} ${
                          video.status === 'processing' ? 'animate-spin' : ''
                        }`} />
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className={`absolute top-2 left-2 flex items-center space-x-1 px-2 py-1 ${statusDisplay.bg} rounded-full text-xs font-medium`}>
                      <StatusIcon className={`h-3 w-3 ${statusDisplay.color} ${
                        video.status === 'processing' ? 'animate-spin' : ''
                      }`} />
                      <span className={statusDisplay.color}>
                        {video.status?.charAt(0).toUpperCase() + video.status?.slice(1)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    {video.status === 'processing' && video.progress !== undefined && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/20 p-2">
                        <div className="w-full bg-gray-200 rounded-full h-1">
                          <div
                            className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                            style={{ width: `${video.progress}%` }}
                          />
                        </div>
                        <p className="text-white text-xs mt-1">{video.progress}% complete</p>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <div className="mb-3">
                      <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                        {video.message.length > 60 ? `${video.message.substring(0, 60)}...` : video.message}
                      </h3>
                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <span className="capitalize">{video.video_type}</span>
                        <span>{new Date(video.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Error Message */}
                    {video.status === 'failed' && video.error_message && (
                      <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        {video.error_message}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex space-x-2">
                      {video.status === 'completed' && video.video_url && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleDownload(video)}
                          className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                        >
                          <Download className="h-3 w-3" />
                          <span>Download</span>
                        </motion.button>
                      )}

                      {(video.status === 'pending' || video.status === 'processing') && video.task_id && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleManualRetry(video)}
                          className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Re-check</span>
                        </motion.button>
                      )}

                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleDelete(video)}
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
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};