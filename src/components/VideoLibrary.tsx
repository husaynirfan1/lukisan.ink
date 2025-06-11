'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, Download, Trash2, Clock, Crown, Calendar, Search, Filter, 
  Grid3X3, List, AlertTriangle, Loader2, Cloud, ExternalLink, 
  RefreshCw, Play, Pause, CheckCircle, XCircle, RotateCcw 
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { downloadVideoFromSupabase, deleteVideoFromSupabase } from '@/lib/videoStorage';
import { videoStatusManager } from '@/lib/videoStatusManager';
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

// --- FIX: Changed 'export default' back to 'export' to match the import statement ---
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
      const { data, error } = await supabase
        .from('video_generations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load video library.');
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      const fetchedVideos = (data || []).map(video => ({
        ...video,
        storage_path: video.video_url ? extractStoragePath(video.video_url) : undefined
      }));

      setVideos(fetchedVideos);

      fetchedVideos.forEach(video => {
        if (['pending', 'processing', 'running'].includes(video.status || '')) {
          videoStatusManager.startMonitoring(video.id, video.video_id, user.id);
        }
      });

    } catch (error) {
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

      const channel = supabase.channel('video-library-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'video_generations', filter: `user_id=eq.${user.id}` },
          (payload) => {
            console.log('[Realtime] Change detected, re-fetching videos.', payload);
            fetchAndMonitorVideos(false); 
          }
        )
        .subscribe();
      
      return () => {
        supabase.removeChannel(channel);
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
    toast.loading('Re-checking video status...', { id: video.id });
    setCheckingStatus(prev => new Set(prev).add(video.id));
    
    try {
      await videoStatusManager.manualStatusCheck(video.id, video.video_id, user.id);
      // Realtime subscription will handle the UI update.
    } catch (error: any) {
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
      // Realtime will update the list, but we can do it optimistically too
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
      case 'pending': return { icon: <Clock className="h-4 w-4" />, color: 'text-yellow-600', bg: 'bg-yellow-100', text: 'Pending' };
      case 'processing':
      case 'running':
        return { icon: <Loader2 className="h-4 w-4 animate-spin" />, color: 'text-blue-600', bg: 'bg-blue-100', text: `Processing ${video.progress || 0}%` };
      case 'completed': return { icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600', bg: 'bg-green-100', text: 'Ready' };
      case 'failed': return { icon: <XCircle className="h-4 w-4" />, color: 'text-red-600', bg: 'bg-red-100', text: 'Failed' };
      default: return { icon: <CheckCircle className="h-4 w-4" />, color: 'text-gray-500', bg: 'bg-gray-100', text: 'Unknown' };
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
      {/* --- Header and Stats sections can be pasted back here from your original file --- */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Video Library</h1>
        <p className="text-gray-600">Track and manage your generated videos.</p>
      </div>
      
      {/* --- Controls section can be pasted back here from your original file --- */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-gray-200/50 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search videos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* --- Content Grid / List --- */}
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
            initial="hidden" animate="visible" variants={{
              visible: { transition: { staggerChildren: 0.05 } }
            }}>
            {filteredVideos.map((video) => {
              const statusDisplay = getStatusDisplay(video);
              const isProcessing = ['pending', 'processing', 'running'].includes(video.status || '');
              const canDownload = video.status === 'completed';
              
              return (
                <motion.div
                  key={video.id}
                  variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}
                  className="bg-white rounded-xl shadow-md overflow-hidden border transition-all duration-200 hover:shadow-lg"
                >
                  <div className="relative aspect-video bg-gray-900">
                    {canDownload && video.video_url ? (
                      <video src={video.video_url} className="w-full h-full object-cover" muted loop playsInline autoPlay />
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                        <div className="text-center p-4">
                          <div className={`mx-auto w-12 h-12 flex items-center justify-center rounded-full ${statusDisplay.bg} ${statusDisplay.color}`}>
                            {statusDisplay.icon}
                          </div>
                          <p className={`mt-2 font-medium ${statusDisplay.color}`}>{statusDisplay.text}</p>
                          {video.status === 'failed' && <p className="text-xs text-red-500 mt-1 max-w-xs truncate">{video.error_message}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-gray-800 truncate" title={video.message}>{video.message}</p>
                    <p className="text-sm text-gray-500">{new Date(video.created_at).toLocaleDateString()}</p>
                    <div className="flex items-center justify-between mt-4">
                       <div className={`flex items-center space-x-2 text-sm px-2 py-1 rounded-full ${statusDisplay.bg} ${statusDisplay.color}`}>
                          {statusDisplay.icon}
                          <span>{statusDisplay.text}</span>
                        </div>
                      <div className="flex items-center space-x-2">
                        {isProcessing && (
                          <button onClick={() => handleManualRetry(video)} disabled={checkingStatus.has(video.id)} className="p-2 text-gray-500 hover:text-blue-600 rounded-full hover:bg-gray-100 transition-colors">
                            <RotateCcw className={`h-4 w-4 ${checkingStatus.has(video.id) ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(video.id)} className="p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors">
                          <Trash2 className="h-4 w-4" />
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
