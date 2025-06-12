import React from 'react';
import { motion } from 'framer-motion';
import { 
  HardDrive, Clock, CheckCircle, XCircle, 
  Upload, Plus, Video
} from 'lucide-react';

interface VideoStatsBarProps {
  stats: {
    total: number;
    completed: number;
    processing: number;
    failed: number;
    totalSize: number;
  };
  onUpload?: () => void;
  onCreateNew?: () => void;
}

export const VideoStatsBar: React.FC<VideoStatsBarProps> = ({
  stats,
  onUpload,
  onCreateNew
}) => {
  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200/50 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Storage Usage */}
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-gray-100 rounded-lg">
              <HardDrive className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Storage</p>
              <p className="text-xs text-gray-600">{formatBytes(stats.totalSize)}</p>
            </div>
          </div>
          
          {/* Total Videos */}
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Video className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Total</p>
              <p className="text-xs text-gray-600">{stats.total} videos</p>
            </div>
          </div>
          
          {/* Processing Videos */}
          {stats.processing > 0 && (
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-900">Processing</p>
                <p className="text-xs text-blue-600">{stats.processing} videos</p>
              </div>
            </div>
          )}
          
          {/* Completed Videos */}
          {stats.completed > 0 && (
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-green-900">Completed</p>
                <p className="text-xs text-green-600">{stats.completed} videos</p>
              </div>
            </div>
          )}
          
          {/* Failed Videos */}
          {stats.failed > 0 && (
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-900">Failed</p>
                <p className="text-xs text-red-600">{stats.failed} videos</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          {onUpload && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onUpload}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Upload className="h-4 w-4" />
              <span className="text-sm">Upload Video</span>
            </motion.button>
          )}
          
          {onCreateNew && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onCreateNew}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm">Create New</span>
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};