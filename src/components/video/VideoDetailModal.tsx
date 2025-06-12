import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Download, Share, Copy, Calendar, Clock, FileVideo, 
  Info, CheckCircle, Loader2, Play, Pause, Volume2, VolumeX
} from 'lucide-react';
import { VideoRecord } from '../../lib/videoLibraryService';
import toast from 'react-hot-toast';

interface VideoDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  video: VideoRecord;
  onDownload: (videoUrl: string, filename: string) => Promise<void>;
}

export const VideoDetailModal: React.FC<VideoDetailModalProps> = ({
  isOpen,
  onClose,
  video,
  onDownload
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!isOpen || !video) return null;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(console.error);
    }
    
    setIsPlaying(!isPlaying);
  };

  const handleMuteToggle = () => {
    if (!videoRef.current) return;
    
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleDownload = async () => {
    if (!video.video_url) {
      toast.error('Video URL not available');
      return;
    }
    
    setIsDownloading(true);
    
    try {
      const filename = `video-${video.video_type}-${Date.now()}.mp4`;
      await onDownload(video.video_url, filename);
      toast.success('Download started!');
    } catch (error: any) {
      toast.error(`Download failed: ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyLink = () => {
    if (!video.video_url) {
      toast.error('Video URL not available');
      return;
    }
    
    navigator.clipboard.writeText(video.video_url)
      .then(() => toast.success('Video URL copied to clipboard'))
      .catch(() => toast.error('Failed to copy URL'));
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 truncate" title={video.message}>
              {video.message}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="h-5 w-5 text-gray-600" />
            </button>
          </div>
          
          {/* Video Player */}
          <div className="relative bg-black aspect-video">
            {video.video_url ? (
              <>
                <video
                  ref={videoRef}
                  src={video.video_url}
                  poster={video.thumbnail_url}
                  className="w-full h-full object-contain"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  muted={isMuted}
                  controls={false}
                />
                
                {/* Custom Video Controls */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={handlePlayPause}
                        className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5 text-white" />
                        ) : (
                          <Play className="h-5 w-5 text-white ml-0.5" />
                        )}
                      </button>
                      
                      <button
                        onClick={handleMuteToggle}
                        className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                      >
                        {isMuted ? (
                          <VolumeX className="h-5 w-5 text-white" />
                        ) : (
                          <Volume2 className="h-5 w-5 text-white" />
                        )}
                      </button>
                    </div>
                    
                    <div className="text-white text-sm">
                      {video.video_type.charAt(0).toUpperCase() + video.video_type.slice(1)}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-white text-center">
                  <FileVideo className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Video not available</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Video Info */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column - Details */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Video Details</h3>
                
                <div className="space-y-3">
                  <div className="flex items-start">
                    <Calendar className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Created</p>
                      <p className="text-sm text-gray-600">
                        {new Date(video.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <Clock className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Last Updated</p>
                      <p className="text-sm text-gray-600">
                        {new Date(video.updated_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <FileVideo className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">File Size</p>
                      <p className="text-sm text-gray-600">
                        {video.file_size ? formatFileSize(video.file_size) : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <Info className="h-5 w-5 text-gray-500 mt-0.5 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Status</p>
                      <div className="flex items-center space-x-2 mt-1">
                        {video.status === 'completed' ? (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-sm text-green-600">Completed</span>
                          </>
                        ) : (
                          <>
                            <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                            <span className="text-sm text-blue-600 capitalize">{video.status}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Right Column - Description & Actions */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Description</h3>
                <p className="text-gray-700 mb-6 whitespace-pre-line">
                  {video.message}
                </p>
                
                {/* Actions */}
                <div className="space-y-3">
                  <button
                    onClick={handleDownload}
                    disabled={!video.video_url || isDownloading}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Downloading...</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-5 w-5" />
                        <span>Download Video</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={handleCopyLink}
                    disabled={!video.video_url}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Copy className="h-5 w-5" />
                    <span>Copy Video URL</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};