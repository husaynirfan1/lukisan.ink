import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Images, Crown, Video } from 'lucide-react';
import { LogoGenerator } from '../components/LogoGenerator';
import { ImageLibrary } from '../components/ImageLibrary';
import { VideoGenerator } from '../components/video/VideoGenerator';
import { EnhancedVideoLibrary } from '../components/video/EnhancedVideoLibrary';
import { SubscriptionCard } from '../components/SubscriptionCard';
import { useAuth } from '../hooks/useAuth';

type DashboardTab = 'generate' | 'library' | 'video' | 'video-library';

export const Dashboard: React.FC = () => {
  const { user, getUserTier } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('generate');
  const [debugAllowVideoTabForFree, setDebugAllowVideoTabForFree] = useState(false);

  const userTier = getUserTier();
  const isProUser = userTier === 'pro';

  // Listen for debug events to allow video tab for free users
  React.useEffect(() => {
    const handleDebugEvent = (event: CustomEvent) => {
      setDebugAllowVideoTabForFree(event.detail.allowed);
    };

    // Check localStorage on mount
    const stored = localStorage.getItem('debug_allow_video_tab_for_free');
    if (stored === 'true') {
      setDebugAllowVideoTabForFree(true);
    }

    window.addEventListener('debugAllowVideoTabForFree', handleDebugEvent as EventListener);
    
    return () => {
      window.removeEventListener('debugAllowVideoTabForFree', handleDebugEvent as EventListener);
    };
  }, []);

  const tabs = [
    {
      id: 'generate' as DashboardTab,
      name: 'Generate Logos',
      icon: Sparkles,
      description: 'Create new AI-powered logos',
    },
    {
      id: 'video' as DashboardTab,
      name: 'Create Videos',
      icon: Video,
      description: 'Generate AI-powered marketing videos',
      proOnly: true,
    },
    {
      id: 'library' as DashboardTab,
      name: 'Logo Library',
      icon: Images,
      description: 'View and manage your generated logos',
    },
    {
      id: 'video-library' as DashboardTab,
      name: 'Video Library',
      icon: Video,
      description: 'View and manage your generated videos',
      proOnly: true,
    },
  ];

  const handleTabChange = (tabId: DashboardTab) => {
    setActiveTab(tabId);
    
    // Update URL without page reload
    const newUrl = `/dashboard/${tabId}`;
    window.history.pushState({ tab: tabId }, '', newUrl);
  };

  // FIXED: Improved handling of browser back/forward and popstate events
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      console.log('[Dashboard] PopState event received:', event.state);
      
      // If there's a specific tab in the state, use it
      if (event.state?.tab) {
        setActiveTab(event.state.tab);
        return;
      }
      
      // Otherwise, try to determine tab from URL
      const pathParts = window.location.pathname.split('/');
      const urlTab = pathParts[2] as DashboardTab;
      
      if (urlTab && tabs.some(t => t.id === urlTab)) {
        setActiveTab(urlTab);
      } else {
        // Default to generate if no valid tab is found
        setActiveTab('generate');
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Set initial tab based on URL
    const pathParts = window.location.pathname.split('/');
    const urlTab = pathParts[2] as DashboardTab;
    
    if (urlTab && tabs.some(t => t.id === urlTab)) {
      setActiveTab(urlTab);
      
      // Ensure the history state is set correctly
      if (!window.history.state || window.history.state.tab !== urlTab) {
        window.history.replaceState({ tab: urlTab }, '', window.location.pathname);
      }
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // FIXED: Improved handling of task_id in URL query params for direct video status viewing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('task_id');
    
    if (taskId) {
      console.log(`[Dashboard] Found task_id in URL: ${taskId}`);
      
      // If there's a task_id, switch to video library tab
      setActiveTab('video-library');
      
      // Remove the query parameter after processing
      window.history.replaceState(
        { tab: 'video-library', taskId }, 
        '', 
        '/dashboard/video-library'
      );
      
      // Scroll to the video with this task_id if it exists (with retry)
      const scrollToVideo = (attempts = 0) => {
        const videoElement = document.getElementById(`video-${taskId}`);
        if (videoElement) {
          console.log(`[Dashboard] Found video element for task ${taskId}, scrolling into view`);
          videoElement.scrollIntoView({ behavior: 'smooth' });
          
          // Add a highlight effect
          videoElement.classList.add('ring-4', 'ring-purple-500', 'ring-opacity-50');
          setTimeout(() => {
            videoElement.classList.remove('ring-4', 'ring-purple-500', 'ring-opacity-50');
          }, 3000);
        } else if (attempts < 5) {
          // Retry a few times with increasing delays
          console.log(`[Dashboard] Video element for task ${taskId} not found, retrying (${attempts + 1}/5)`);
          setTimeout(() => scrollToVideo(attempts + 1), 1000 * (attempts + 1));
        }
      };
      
      // Start the first attempt after a delay to allow the component to render
      setTimeout(() => scrollToVideo(), 1000);
    }
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="heading-tertiary text-gray-900 mb-4">Access Denied</h2>
          <p className="body-regular text-gray-600">Please sign in to access the dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      {/* Dashboard Header */}
      <div className="bg-white/60 backdrop-blur-sm border-b border-gray-200/50 sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            {/* Welcome Section */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="heading-secondary text-gray-900">
                  Welcome back, {user.name}!
                </h1>
                <p className="body-regular text-gray-600 mt-1">
                  {isProUser ? 'Creator Account' : 'Free Account'} • 
                  {isProUser 
                    ? ` ${user.credits_remaining} credits remaining`
                    : ` ${Math.max(0, 3 - user.daily_generations)} generations left today`
                  }
                </p>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex flex-wrap space-x-1 bg-gray-100 rounded-lg p-1">
              {tabs.map((tab) => {
                const IconComponent = tab.icon;
                const isActive = activeTab === tab.id;
                const isDisabled = tab.proOnly && !isProUser && !debugAllowVideoTabForFree;
                
                return (
                  <motion.button
                    key={tab.id}
                    whileHover={{ scale: isDisabled ? 1 : 1.02 }}
                    whileTap={{ scale: isDisabled ? 1 : 0.98 }}
                    onClick={() => !isDisabled && handleTabChange(tab.id)}
                    disabled={isDisabled}
                    className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-md transition-all duration-200 relative nav-text ${
                      isActive
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : isDisabled
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                    }`}
                  >
                    <IconComponent className="h-5 w-5" />
                    <span>{tab.name}</span>
                    {tab.proOnly && !isProUser && !debugAllowVideoTabForFree && (
                      <Crown className="h-4 w-4 text-yellow-500" />
                    )}
                    {tab.proOnly && !isProUser && debugAllowVideoTabForFree && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-xs text-white">🔓</span>
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'generate' && (
            <div id="logo-generator">
              <LogoGenerator />
            </div>
          )}
          
          {activeTab === 'video' && <VideoGenerator />}
          
          {activeTab === 'library' && <ImageLibrary />}

          {activeTab === 'video-library' && <EnhancedVideoLibrary />}
        </motion.div>
      </div>
    </div>
  );
};