import React, { useState, useEffect } from 'react';
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
  Pause
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { downloadVideoFromSupabase, deleteVideoFromSupabase } from '../lib/videoStorage';
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

  const userTier = getUserTier();
  const isProUser = userTier === 'pro';

  useEffect(() => {
    if (user) {
      fetchVideos();
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

      // Add storage path extraction for videos stored in Supabase
      const videosWithStoragePath = (data || []).map(video => ({
        ...video,
        storage_path: extractStoragePath(video.video_url)
      }));

      setVideos(videosWithStoragePath);
      console.log('Updated local state with videos:', videosWithStoragePath.length);
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast.error('Failed to load video library');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Extract storage path from Supabase URL
  const extractStoragePath = (url: string): string | undefined => {
    if (!url.includes('supabase.co/storage/v1/object/public/generated-videos/')) {
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
    toast.success('Library refreshed');
  };

  const toggleVideoPlay = (videoId: string) => {
    setPlayingVideo(prev => prev === videoId ? null : videoId);
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
                {isProUser ? 'Your videos are stored until subscription ends' : 'Free videos expire after 2 hours'}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                <Cloud className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">High Quality</p>
                <p className="text-xl font-bold text-gray-900">
                  {videos.filter(video => video.video_url.includes('supabase.co')).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${isProUser ? 'bg-yellow-100' : 'bg-blue-100'}`}>
                {isProUser ? (
                  <Crown className="h-5 w-5 text-yellow-600" />
                ) : (
                  <Clock className="h-5 w-5 text-blue-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-gray-600">
                  {isProUser ? 'Pro Storage' : 'Available'}
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {isProUser ? 'Unlimited' : videos.length}
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
                const isHighQuality = video.video_url.includes('supabase.co');
                const isPlaying = playingVideo === video.id;

                return (
                  <motion.div
                    key={video.id}
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
                      <video
                        src={video.video_url}
                        className="w-full h-full object-cover"
                        muted
                        loop
                        playsInline
                        ref={(el) => {
                          if (el) {
                            if (isPlaying) {
                              el.play();
                            } else {
                              el.pause();
                            }
                          }
                        }}
                      />
                      
                      {/* Play/Pause overlay */}
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

                      {/* Selection overlay */}
                      <div 
                        className="absolute top-2 left-2 w-6 h-6 rounded border-2 border-white bg-black/20 flex items-center justify-center cursor-pointer"
                        onClick={() => toggleVideoSelection(video.id)}
                      >
                        {isSelected && <span className="text-white text-xs">✓</span>}
                      </div>

                      {/* Status badges */}
                      <div className="absolute top-2 right-2 flex flex-col space-y-1">
                        {isHighQuality && (
                          <div className="flex items-center space-x-1 px-2 py-1 bg-green-500 text-white rounded-full text-xs">
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
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleDownload(video)}
                          disabled={isDeleting}
                          className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download className="h-3 w-3" />
                          <span>Download</span>
                        </motion.button>
                        
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
                  const isHighQuality = video.video_url.includes('supabase.co');

                  return (
                    <motion.div
                      key={video.id}
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
                          <video
                            src={video.video_url}
                            className="w-full h-full object-cover"
                            muted
                          />
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
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleDownload(video)}
                            disabled={isDeleting}
                            className="flex items-center space-x-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Download className="h-3 w-3" />
                            <span>Download</span>
                          </motion.button>
                          
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