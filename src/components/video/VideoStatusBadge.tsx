import React from 'react';
import { 
  Clock, Loader2, Download, Database, CheckCircle, 
  XCircle, AlertTriangle 
} from 'lucide-react';
import { motion } from 'framer-motion';

interface VideoStatusBadgeProps {
  status: 'pending' | 'processing' | 'downloading' | 'storing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const VideoStatusBadge: React.FC<VideoStatusBadgeProps> = ({
  status,
  progress = 0,
  error,
  size = 'md',
  showLabel = true,
  className = ''
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
          borderColor: 'border-yellow-200',
          label: 'Pending'
        };
      case 'processing':
        return {
          icon: Loader2,
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          borderColor: 'border-blue-200',
          label: `Processing ${progress}%`,
          animate: true
        };
      case 'downloading':
        return {
          icon: Download,
          color: 'text-purple-600',
          bgColor: 'bg-purple-100',
          borderColor: 'border-purple-200',
          label: 'Downloading',
          animate: true
        };
      case 'storing':
        return {
          icon: Database,
          color: 'text-indigo-600',
          bgColor: 'bg-indigo-100',
          borderColor: 'border-indigo-200',
          label: 'Storing',
          animate: true
        };
      case 'completed':
        return {
          icon: CheckCircle,
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-200',
          label: 'Completed'
        };
      case 'failed':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          borderColor: 'border-red-200',
          label: 'Failed'
        };
      default:
        return {
          icon: AlertTriangle,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200',
          label: 'Unknown'
        };
    }
  };

  const config = getStatusConfig();
  const IconComponent = config.icon;
  
  // Size configurations
  const sizeConfig = {
    sm: {
      padding: 'px-2 py-1',
      iconSize: 'h-3 w-3',
      fontSize: 'text-xs',
      space: 'space-x-1'
    },
    md: {
      padding: 'px-3 py-1.5',
      iconSize: 'h-4 w-4',
      fontSize: 'text-sm',
      space: 'space-x-1.5'
    },
    lg: {
      padding: 'px-4 py-2',
      iconSize: 'h-5 w-5',
      fontSize: 'text-base',
      space: 'space-x-2'
    }
  };
  
  const sizeClasses = sizeConfig[size];

  return (
    <div 
      className={`inline-flex items-center ${sizeClasses.padding} ${sizeClasses.space} rounded-full ${config.bgColor} ${config.color} border ${config.borderColor} ${className}`}
      title={error || config.label}
    >
      {config.animate ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        >
          <IconComponent className={sizeClasses.iconSize} />
        </motion.div>
      ) : (
        <IconComponent className={sizeClasses.iconSize} />
      )}
      
      {showLabel && (
        <span className={`font-medium ${sizeClasses.fontSize}`}>
          {config.label}
        </span>
      )}
    </div>
  );
};