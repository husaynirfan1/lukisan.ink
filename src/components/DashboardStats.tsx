import React from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Calendar, 
  Zap, 
  Target,
  BarChart3,
  PieChart,
  Activity,
  Award,
  Clock,
  Sparkles
} from 'lucide-react';
import { User } from '../lib/supabase';

interface DashboardStatsProps {
  data: any;
  loading: boolean;
  user: User;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({ data, loading, user }) => {
  if (loading) {
    return (
      <div className="space-y-6">
        {/* Loading skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
              <div className="animate-pulse">
                <div className="w-12 h-12 bg-gray-200 rounded-lg mb-4"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-6 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
        <p className="text-gray-600">Start generating logos to see your analytics</p>
      </div>
    );
  }

  const stats = [
    {
      id: 'total-generations',
      name: 'Total Generations',
      value: data.totalGenerations,
      icon: Sparkles,
      color: 'from-purple-500 to-pink-600',
      bgColor: 'from-purple-50 to-pink-50',
      change: '+12%',
      changeType: 'positive' as const,
    },
    {
      id: 'credits-used',
      name: 'Credits Used',
      value: data.userStats.creditsUsed,
      icon: Zap,
      color: 'from-blue-500 to-cyan-600',
      bgColor: 'from-blue-50 to-cyan-50',
      change: `${user.credits_remaining} remaining`,
      changeType: 'neutral' as const,
    },
    {
      id: 'today-generations',
      name: 'Today\'s Generations',
      value: data.userStats.generationsToday,
      icon: Calendar,
      color: 'from-green-500 to-emerald-600',
      bgColor: 'from-green-50 to-emerald-50',
      change: '+3 from yesterday',
      changeType: 'positive' as const,
    },
    {
      id: 'favorite-category',
      name: 'Favorite Category',
      value: data.userStats.favoriteCategory,
      icon: Target,
      color: 'from-orange-500 to-red-600',
      bgColor: 'from-orange-50 to-red-50',
      change: '60% of generations',
      changeType: 'neutral' as const,
    },
  ];

  const recentActivity = data.recentGenerations.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const IconComponent = stat.icon;
          
          return (
            <motion.div
              key={stat.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`bg-gradient-to-br ${stat.bgColor} rounded-2xl p-6 border border-gray-200/50 relative overflow-hidden`}
            >
              {/* Background decoration */}
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${stat.color} opacity-10 rounded-full transform translate-x-16 -translate-y-16`}></div>
              
              <div className="relative">
                <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-lg flex items-center justify-center mb-4`}>
                  <IconComponent className="h-6 w-6 text-white" />
                </div>
                
                <h3 className="text-sm font-medium text-gray-600 mb-1">{stat.name}</h3>
                <p className="text-2xl font-bold text-gray-900 mb-2">
                  {typeof stat.value === 'string' ? stat.value : stat.value.toLocaleString()}
                </p>
                
                <div className={`flex items-center text-sm ${
                  stat.changeType === 'positive' ? 'text-green-600' :
                  stat.changeType === 'negative' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {stat.changeType === 'positive' && <TrendingUp className="h-4 w-4 mr-1" />}
                  <span>{stat.change}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Usage Over Time */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Usage Over Time</h3>
            <BarChart3 className="h-5 w-5 text-gray-400" />
          </div>
          
          {/* Simple chart placeholder */}
          <div className="h-48 bg-gradient-to-t from-indigo-100 to-transparent rounded-lg flex items-end justify-center">
            <div className="text-center text-gray-500">
              <Activity className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Chart visualization coming soon</p>
            </div>
          </div>
        </motion.div>

        {/* Category Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Category Distribution</h3>
            <PieChart className="h-5 w-5 text-gray-400" />
          </div>
          
          {/* Simple chart placeholder */}
          <div className="h-48 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-500">
              <PieChart className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Chart visualization coming soon</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          <Clock className="h-5 w-5 text-gray-400" />
        </div>
        
        {recentActivity.length > 0 ? (
          <div className="space-y-4">
            {recentActivity.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + index * 0.1 }}
                className="flex items-center space-x-4 p-4 bg-white/50 rounded-lg border border-gray-200/30"
              >
                <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={activity.image_url}
                    alt="Generated logo"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&cs=tinysrgb&w=48&h=48&fit=crop';
                    }}
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {activity.prompt.length > 60 ? `${activity.prompt.substring(0, 60)}...` : activity.prompt}
                  </p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs text-gray-500 capitalize">{activity.category}</span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">
                      {new Date(activity.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Award className="h-4 w-4 text-yellow-500" />
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Activity className="h-8 w-8 mx-auto mb-2" />
            <p>No recent activity</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};