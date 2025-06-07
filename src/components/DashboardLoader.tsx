import React from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles, Crown, Users } from 'lucide-react';

interface DashboardLoaderProps {
  stage: 'initializing' | 'authenticating' | 'loading_profile' | 'loading_data' | 'complete';
  progress?: number;
  message?: string;
}

const stageConfig = {
  initializing: {
    icon: Loader2,
    title: 'Initializing',
    description: 'Setting up your workspace...',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  authenticating: {
    icon: Users,
    title: 'Authenticating',
    description: 'Verifying your credentials...',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  loading_profile: {
    icon: Crown,
    title: 'Loading Profile',
    description: 'Fetching your account details...',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  loading_data: {
    icon: Sparkles,
    title: 'Loading Dashboard',
    description: 'Preparing your creative tools...',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
  complete: {
    icon: Sparkles,
    title: 'Ready',
    description: 'Welcome to Lukisan.ink!',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
};

export const DashboardLoader: React.FC<DashboardLoaderProps> = ({ 
  stage, 
  progress = 0, 
  message 
}) => {
  const config = stageConfig[stage];
  const IconComponent = config.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-md mx-auto px-6"
      >
        {/* Icon */}
        <motion.div
          className={`w-20 h-20 ${config.bgColor} rounded-full flex items-center justify-center mx-auto mb-6`}
          animate={{ rotate: stage === 'complete' ? 0 : 360 }}
          transition={{ 
            duration: stage === 'complete' ? 0 : 2, 
            repeat: stage === 'complete' ? 0 : Infinity, 
            ease: "linear" 
          }}
        >
          <IconComponent className={`h-10 w-10 ${config.color}`} />
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-2xl font-bold text-gray-900 mb-2"
        >
          {config.title}
        </motion.h2>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-gray-600 mb-6"
        >
          {message || config.description}
        </motion.p>

        {/* Progress Bar */}
        {progress > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full bg-gray-200 rounded-full h-2 mb-4"
          >
            <motion.div
              className={`h-2 rounded-full ${config.bgColor.replace('bg-', 'bg-gradient-to-r from-').replace('-100', '-400 to-' + config.bgColor.split('-')[1] + '-600')}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </motion.div>
        )}

        {/* Loading dots */}
        {stage !== 'complete' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex justify-center space-x-1"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className={`w-2 h-2 ${config.bgColor.replace('-100', '-400')} rounded-full`}
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </motion.div>
        )}

        {/* Development info */}
        {process.env.NODE_ENV === 'development' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-6 p-3 bg-gray-100 rounded-lg text-xs text-gray-500"
          >
            <div>Stage: {stage}</div>
            {progress > 0 && <div>Progress: {progress}%</div>}
            {message && <div>Message: {message}</div>}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};