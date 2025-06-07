import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getUserSubscription } from '../lib/stripe';
import { useAuth } from './useAuth';

interface DashboardData {
  recentGenerations: any[];
  totalGenerations: number;
  subscription: any;
  userStats: {
    creditsUsed: number;
    generationsToday: number;
    favoriteCategory: string;
  };
}

interface DashboardState {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export const useDashboardData = () => {
  const { user } = useAuth();
  const [state, setState] = useState<DashboardState>({
    data: null,
    loading: false,
    error: null,
    lastUpdated: null,
  });

  const fetchDashboardData = useCallback(async (showLoading = true) => {
    if (!user) return;

    if (showLoading) {
      setState(prev => ({ ...prev, loading: true, error: null }));
    }

    try {
      console.log('[DASHBOARD DATA] Fetching dashboard data for user:', user.id);

      // Fetch data in parallel for better performance
      const [
        recentGenerationsResult,
        totalGenerationsResult,
        subscriptionResult
      ] = await Promise.allSettled([
        // Recent generations (last 10)
        supabase
          .from('logo_generations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
        
        // Total generations count
        supabase
          .from('logo_generations')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id),
        
        // Subscription data
        getUserSubscription()
      ]);

      // Process results
      const recentGenerations = recentGenerationsResult.status === 'fulfilled' 
        ? recentGenerationsResult.value.data || []
        : [];

      const totalGenerations = totalGenerationsResult.status === 'fulfilled'
        ? totalGenerationsResult.value.count || 0
        : 0;

      const subscription = subscriptionResult.status === 'fulfilled'
        ? subscriptionResult.value
        : null;

      // Calculate user stats
      const today = new Date().toISOString().split('T')[0];
      const generationsToday = recentGenerations.filter(gen => 
        gen.created_at.split('T')[0] === today
      ).length;

      // Find favorite category
      const categoryCount = recentGenerations.reduce((acc, gen) => {
        acc[gen.category] = (acc[gen.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const favoriteCategory = Object.entries(categoryCount)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'tech';

      const creditsUsed = user.tier === 'pro' 
        ? Math.max(0, 100 - user.credits_remaining)
        : user.daily_generations;

      const dashboardData: DashboardData = {
        recentGenerations,
        totalGenerations,
        subscription,
        userStats: {
          creditsUsed,
          generationsToday,
          favoriteCategory,
        },
      };

      setState({
        data: dashboardData,
        loading: false,
        error: null,
        lastUpdated: new Date(),
      });

      console.log('[DASHBOARD DATA] Data fetched successfully:', {
        recentCount: recentGenerations.length,
        totalGenerations,
        hasSubscription: !!subscription,
      });

    } catch (error: any) {
      console.error('[DASHBOARD DATA] Error fetching dashboard data:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to load dashboard data',
      }));
    }
  }, [user]);

  // Initial data fetch
  useEffect(() => {
    if (user) {
      fetchDashboardData();
    } else {
      setState({
        data: null,
        loading: false,
        error: null,
        lastUpdated: null,
      });
    }
  }, [user, fetchDashboardData]);

  // Auto-refresh data every 5 minutes
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      console.log('[DASHBOARD DATA] Auto-refreshing dashboard data');
      fetchDashboardData(false); // Don't show loading for auto-refresh
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [user, fetchDashboardData]);

  const refreshData = useCallback(() => {
    console.log('[DASHBOARD DATA] Manual refresh triggered');
    fetchDashboardData(false);
  }, [fetchDashboardData]);

  return {
    ...state,
    refreshData,
  };
};