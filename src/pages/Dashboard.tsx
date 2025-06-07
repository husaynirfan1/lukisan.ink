import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Images, Crown, BarChart3 } from 'lucide-react';
import { LogoGenerator } from '../components/LogoGenerator';
import { ImageLibrary } from '../components/ImageLibrary';
import { DashboardStats } from '../components/DashboardStats';
import { SubscriptionCard } from '../components/SubscriptionCard';
import { useAuth } from '../hooks/useAuth';
import { useDashboardData } from '../hooks/useDashboardData';

type DashboardTab = 'generate' | 'library' | 'stats';

export const Dashboard: React.FC = () => {
  const { user, getUserTier } = useAuth();
  const { data: dashboardData, loading: dataLoading } = useDashboardData();
  const [activeTab, setActiveTab] = useState<DashboardTab>('generate');

  const userTier = getUserTier();
  const isProUser = userTier === 'pro';

  const tabs = [
    {
      id: 'generate' as DashboardTab,
      name: 'Generate',
      icon: Sparkles,
      description: 'Create new AI-powered logos',
    },
    {
      id: 'library' as DashboardTab,
      name: 'Library',
      icon: Images,
      description: 'View and manage your generated images',
    },
    {
      id: 'stats' as DashboardTab,
      name: 'Analytics',
      icon: BarChart3,
      description: 'View your usage statistics',
      proOnly: true,
    },
  ];

  const handleTabChange = (tabId: DashboardTab) => {
    // Check if tab requires Pro and user is not Pro
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.proOnly && !isProUser) {
      return; // Don't switch to Pro-only tabs for free users
    }
    
    setActiveTab(tabId);
    
    // Update URL without page reload
    const newUrl = `/dashboard/${tabId}`;
    window.history.pushState({ tab: tabId }, '', newUrl);
  };

  // Handle browser back/forward
  React.useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const tab = event.state?.tab || 'generate';
      setActiveTab(tab);
    };

    window.addEventListener('popstate', handlePopState);
    
    // Set initial tab based on URL
    const pathParts = window.location.pathname.split('/');
    const urlTab = pathParts[2] as DashboardTab;
    if (urlTab && tabs.some(t => t.id === urlTab)) {
      setActiveTab(urlTab);
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
          <p className="text-gray-600">Please sign in to access the dashboard</p>
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
                <h1 className="text-3xl font-bold text-gray-900">
                  Welcome back, {user.name}!
                </h1>
                <p className="text-gray-600 mt-1">
                  {isProUser ? 'Pro Account' : 'Free Account'} • 
                  {isProUser 
                    ? ` ${user.credits_remaining} credits remaining`
                    : ` ${Math.max(0, 3 - user.daily_generations)} generations left today`
                  }
                </p>
              </div>
              
              {isProUser && (
                <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800 rounded-full border border-yellow-200">
                  <Crown className="h-5 w-5" />
                  <span className="font-medium">Pro User</span>
                </div>
              )}
            </div>

            {/* Tab Navigation */}
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              {tabs.map((tab) => {
                const IconComponent = tab.icon;
                const isActive = activeTab === tab.id;
                const isDisabled = tab.proOnly && !isProUser;
                
                return (
                  <motion.button
                    key={tab.id}
                    whileHover={{ scale: isDisabled ? 1 : 1.02 }}
                    whileTap={{ scale: isDisabled ? 1 : 0.98 }}
                    onClick={() => handleTabChange(tab.id)}
                    disabled={isDisabled}
                    className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-md transition-all duration-200 relative ${
                      isActive
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : isDisabled
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                    }`}
                  >
                    <IconComponent className="h-5 w-5" />
                    <span className="font-medium">{tab.name}</span>
                    
                    {tab.proOnly && !isProUser && (
                      <Crown className="h-4 w-4 text-yellow-500" />
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
          
          {activeTab === 'library' && <ImageLibrary />}
          
          {activeTab === 'stats' && isProUser && (
            <DashboardStats 
              data={dashboardData} 
              loading={dataLoading}
              user={user}
            />
          )}
          
          {activeTab === 'stats' && !isProUser && (
            <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl p-8 border border-yellow-200/50 text-center">
              <Crown className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Pro Feature</h3>
              <p className="text-gray-600 mb-6">
                Analytics and detailed statistics are available for Pro users. 
                Upgrade to track your usage patterns and optimize your creative workflow.
              </p>
              <SubscriptionCard />
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};