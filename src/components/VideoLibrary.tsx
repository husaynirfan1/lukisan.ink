'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, Download, Trash2, Clock, Crown, Calendar, Search, Filter, 
  Grid3X3, List, AlertTriangle, Loader2, Cloud, ExternalLink, 
  RefreshCw, Play, Pause, CheckCircle, XCircle, RotateCcw 
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { downloadVideoFromSupabase, deleteVideoFromSupabase } from '../lib/videoStorage';
import { videoStatusManager } from '../lib/videoStatusManager';
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
  status?: 'pending' | 'processing' | 'running' | 'completed' | 'failed';
  progress?: number;
  error_message?: string;
}

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
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<Set<string>>(new Set());
  
  const initialFetchDone = useRef(false);
  const userTier = getUserTier();
  const isProUser = userTier === 'pro';

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
        const validStatuses = ['pending', 'processing', 'running', 'completed', 'failed'];
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

      // Start monitoring for videos that are still processing
      fetchedVideos.forEach(video => {
        if (['pending', 'processing', 'running'].includes(video.status || '')) {
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

  useEffect(() => {
    if (user && !initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchAndMonitorVideos();

      // Set up real-time subscription for video updates
      console.log('[VideoLibrary] Setting up real-time subscription');
      const channel = supabase.channel('video-library-changes')
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
      
      return () => {
        console.log('[VideoLibrary] Cleaning up subscription');
        supabase.removeChannel(channel);
        // Stop all monitoring when component unmounts
        videoStatusManager.stopAllMonitoring();
      };
    }
  }, [user, fetchAndMonitorVideos]);

  const extractStoragePath = (url: string): string | undefined => {
    if (!url || !url.includes('supabase.co/storage/v1/object/public/generated-videos/')) {
      return undefined;
    }
    const parts = url.split('/generated-videos/');
    return parts.length > 1 ? parts[1] : undefined;
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

  const getStatusDisplay = (video: StoredVideo) => {
    const isChecking = checkingStatus.has(video.id);
    if (isChecking) return { icon: <Loader2 className="h-4 w-4 animate-spin" />, color: 'text-blue-600', bg: 'bg-blue-100', text: 'Checking...' };
    
    switch (video.status) {
      case 'pending': 
        return { icon: <Clock className="h-4 w-4" />, color: 'text-yellow-600', bg: 'bg-yellow-100', text: 'Pending' };
      case 'processing':
      case 'running':
        return { 
          icon: <Loader2 className="h-4 w-4 animate-spin" />, 
          color: 'text-blue-600', 
          bg: 'bg-blue-100', 
          text: `Processing ${video.progress || 0}%` 
        };
      case 'completed': 
        return { icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600', bg: 'bg-green-100', text: 'Ready' };
      case 'failed': 
        return { 
          icon: <XCircle className="h-4 w-4" />, 
          color: 'text-red-600', 
          bg: 'bg-red-100', 
          text: 'Failed' 
        };
      default: 
        // Fallback for any unrecognized status
        return { icon: <Clock className="h-4 w-4" />, color: 'text-gray-500', bg: 'bg-gray-100', text: 'Unknown' };
    }
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
        <h1 className="text-3xl font-bold text-gray-900">Video Library</h1>
        <p className="text-gray-600">Track and manage your generated videos.</p>
        
        {/* Debug info in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-2 text-xs text-gray-500 bg-gray-100 p-2 rounded">
            Active monitoring: {videoStatusManager.getMonitoringStatus().activeVideos.length} videos
          </div>
        )}
      </div>
      
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-gray-200/50 mb-6">
        <div className="flex items-center justify-between">
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
          
          <div className="flex items-center space-x-4 ml-4">
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
            
            <button
              onClick={() => fetchAndMonitorVideos(false)}
              disabled={refreshing}
              className="flex items-center space-x-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
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
            {filteredVideos.map((video) => {
              const statusDisplay = getStatusDisplay(video);
              const isProcessing = ['pending', 'processing', 'running'].includes(video.status || '');
              const canDownload = video.status === 'completed' && video.video_url;
              
              return (
                <motion.div
                  key={video.id}
                  id={`video-${video.video_id}`} // For direct linking
                  variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}
                  className="bg-white rounded-xl shadow-md overflow-hidden border transition-all duration-200 hover:shadow-lg"
                >
                  <div className="relative aspect-video bg-gray-900">
                    {canDownload ? (
                      <video 
                        src={video.video_url} 
                        className="w-full h-full object-cover" 
                        muted 
                        loop 
                        playsInline 
                        controls
                        poster={video.logo_url}
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                        <div className="text-center p-4">
                          <div className={`mx-auto w-12 h-12 flex items-center justify-center rounded-full ${statusDisplay.bg} ${statusDisplay.color}`}>
                            {statusDisplay.icon}
                          </div>
                          <p className={`mt-2 font-medium ${statusDisplay.color}`}>{statusDisplay.text}</p>
                          {video.status === 'failed' && video.error_message && (
                            <p className="text-xs text-red-500 mt-1 max-w-xs truncate" title={video.error_message}>
                              {video.error_message}
                            </p>
                          )}
                          {video.progress !== undefined && video.progress > 0 && (
                            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${video.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4">
                    <p className="font-semibold text-gray-800 truncate" title={video.message}>
                      {video.message}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(video.created_at).toLocaleDateString()} • {video.video_type}
                    </p>
                    
                    <div className="flex items-center justify-between mt-4">
                      <div className={`flex items-center space-x-2 text-sm px-2 py-1 rounded-full ${statusDisplay.bg} ${statusDisplay.color}`}>
                        {statusDisplay.icon}
                        <span>{statusDisplay.text}</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {canDownload && (
                          <button 
                            onClick={() => {
                              const filename = `video-${video.video_type}-${Date.now()}.mp4`;
                              downloadVideoFromSupabase(video.video_url, filename);
                            }}
                            className="p-2 text-gray-500 hover:text-green-600 rounded-full hover:bg-gray-100 transition-colors"
                            title="Download video"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                        
                        {isProcessing && (
                          <button 
                            onClick={() => handleManualRetry(video)} 
                            disabled={checkingStatus.has(video.id)} 
                            className="p-2 text-gray-500 hover:text-blue-600 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
                            title="Re-check status"
                          >
                            <RotateCcw className={`h-4 w-4 ${checkingStatus.has(video.id) ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                        
                        <button 
                          onClick={() => handleDelete(video.id)} 
                          disabled={deletingVideos.has(video.id)}
                          className="p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
                          title="Delete video"
                        >
                          {deletingVideos.has(video.id) ? (
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
            })}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};