import React from 'react';
import { motion } from 'framer-motion';
import { Video, Plus, RefreshCw } from 'lucide-react';

interface VideoEmptyStateProps {
  type: 'empty' | 'no-results' | 'error';
  message?: string;
  onRefresh?: () => void;
  onCreateNew?: () => void;
}

export const VideoEmptyState: React.FC<VideoEmptyStateProps> = ({
  type,
  message,
  onRefresh,
  onCreateNew
}) => {
  const getContent = () => {
    switch (type) {
      case 'empty':
        return {
          icon: Video,
          title: 'No videos yet',
          description: message || 'Create your first video to see it here',
          primaryAction: onCreateNew ? {
            label: 'Create New Video',
            icon: Plus,
            onClick: onCreateNew
          } : undefined
        };
      case 'no-results':
        return {
          icon: Video,
          title: 'No matching videos',
          description: message || 'Try adjusting your search or filters',
          primaryAction: onRefresh ? {
            label: 'Refresh Library',
            icon: RefreshCw,
            onClick: onRefresh
          } : undefined
        };
      case 'error':
        return {
          icon: Video,
          title: 'Failed to load videos',
          description: message || 'There was an error loading your video library',
          primaryAction: onRefresh ? {
            label: 'Try Again',
            icon: RefreshCw,
            onClick: onRefresh
          } : undefined
        };
    }
  };

  const content = getContent();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-16"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.2 }}
        transition={{ delay: 0.2 }}
        className="mx-auto w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-6"
      >
        <content.icon className="h-12 w-12 text-gray-400" />
      </motion.div>

      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-xl font-semibold text-gray-900 mb-2"
      >
        {content.title}
      </motion.h3>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-gray-600 mb-8 max-w-md mx-auto"
      >
        {content.description}
      </motion.p>

      {content.primaryAction && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={content.primaryAction.onClick}
          className="inline-flex items-center space-x-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-md"
        >
          <content.primaryAction.icon className="h-5 w-5" />
          <span>{content.primaryAction.label}</span>
        </motion.button>
      )}
    </motion.div>
  );
};