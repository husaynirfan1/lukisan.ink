import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Loader2, Download, Database, CheckCircle, XCircle, Play, RotateCcw, Trash2
} from 'lucide-react';
import { videoLibraryService } from '../../lib/videoLibraryService';

interface VideoRecord {
  id: string;
  message: string;
  video_type: string;
  status: string;
  video_url?: string;
  created_at: string;
  progress?: number;
  file_size?: number;
  error_message?: string;
}

interface Props {
  video: VideoRecord;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  isDeleting: boolean;
  isRetrying: boolean;
}

export const ListVideoCard: React.FC<Props> = ({
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

  const canDownload = video.status === 'completed' && video.video_url;
  const isProcessing = ['pending', 'processing', 'downloading', 'storing'].includes(video.status || '');

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (canDownload && videoRef.current) {
      previewTimeoutRef.current = setTimeout(() => {
        setShowPreview(true);
        videoRef.current?.play().catch(console.error);
        setIsPlaying(true);
      }, 500);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setShowPreview(false);
    setIsPlaying(false);
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canDownload || !videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleDownload = () => {
    if (video.video_url) {
      videoLibraryService.downloadVideo(video.video_url, `video-${video.video_type}-${Date.now()}.mp4`);
    }
  };

  const getStatusDisplay = () => {
    switch (video.status) {
      case 'pending': return { icon: <Clock className="h-4 w-4" />, color: 'text-yellow-600', bg: 'bg-yellow-100', text: 'Pending' };
      case 'processing': return { icon: <Loader2 className="h-4 w-4 animate-spin" />, color: 'text-blue-600', bg: 'bg-blue-100', text: `Processing ${video.progress || 0}%` };
      case 'downloading': return { icon: <Download className="h-4 w-4 animate-pulse" />, color: 'text-purple-600', bg: 'bg-purple-100', text: 'Downloading' };
      case 'storing': return { icon: <Database className="h-4 w-4 animate-pulse" />, color: 'text-indigo-600', bg: 'bg-indigo-100', text: 'Storing' };
      case 'completed': return { icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600', bg: 'bg-green-100', text: 'Ready' };
      case 'failed': return { icon: <XCircle className="h-4 w-4" />, color: 'text-red-600', bg: 'bg-red-100', text: 'Failed' };
      default: return { icon: <Clock className="h-4 w-4" />, color: 'text-gray-500', bg: 'bg-gray-100', text: 'Unknown' };
    }
  };

  const statusDisplay = getStatusDisplay();

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <AnimatePresence>
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="bg-white rounded-xl shadow-md overflow-hidden border transition-all duration-200 hover:shadow-lg"
      >
        <div className="flex flex-col md:flex-row">
          <div
            className="md:w-64 h-40 bg-gray-900 relative cursor-pointer"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleVideoClick}
          >
            {canDownload ? (
              <>
                <video
                  ref={videoRef}
                  src={video.video_url || undefined}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  playsInline
                  poster="https://placehold.co/400x225/E0E0E0/333333/png?text=Hover+\nto+Preview"
                  style={{ display: showPreview ? 'block' : 'none' }}
                />
                {!showPreview && (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                    <img
                      src="https://placehold.co/400x225/E0E0E0/333333/png?text=Preview"
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
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className={`w-12 h-12 flex items-center justify-center rounded-full ${statusDisplay.bg} ${statusDisplay.color}`}>
                  {statusDisplay.icon}
                </div>
              </div>
            )}

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
                  {video.message.length > 100 ? `${video.message.substring(0, 100)}...` : video.message}
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

            {video.status === 'failed' && video.error_message && (
              <div className="mt-2 p-2 bg-red-50 rounded-lg">
                <p className="text-xs text-red-600">{video.error_message}</p>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end space-x-2">
              {canDownload && (
                <button
                  onClick={handleDownload}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  <Download className="h-4 w-4" />
                  <span>Download</span>
                </button>
              )}

              {isProcessing && (
                <button
                  onClick={() => onRetry(video.id)}
                  disabled={isRetrying}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                >
                  <RotateCcw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                  <span>Check Status</span>
                </button>
              )}

              <button
                onClick={() => onDelete(video.id)}
                disabled={isDeleting}
                className="flex items-center space-x-1 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
              >
                {isDeleting ? (
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
    </AnimatePresence>
  );
};
