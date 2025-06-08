import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bug, ChevronDown, ChevronUp, RefreshCw, Plus, Coins, Unlock, Video } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

export const DebugPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingCredits, setIsAddingCredits] = useState(false);
  const [creditAmount, setCreditAmount] = useState(10);
  const [allowAllAspectRatios, setAllowAllAspectRatios] = useState(false);
  const [allowVideoTabForFree, setAllowVideoTabForFree] = useState(false);
  const { user, loading, error, authStep, subscription, refetchUser } = useAuth();

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const clearAuthData = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  const testConnection = async () => {
    try {
      const { data, error } = await supabase.from('users').select('count').limit(1);
      console.log('Database connection test:', { data, error });
      alert(`Database test: ${error ? 'Failed - ' + error.message : 'Success'}`);
    } catch (error) {
      console.error('Connection test error:', error);
      alert('Connection test failed');
    }
  };

  const addCredits = async () => {
    if (!user) {
      toast.error('No user logged in');
      return;
    }

    if (creditAmount <= 0 || creditAmount > 1000) {
      toast.error('Credit amount must be between 1 and 1000');
      return;
    }

    setIsAddingCredits(true);

    try {
      const newCreditAmount = user.credits_remaining + creditAmount;
      
      const { error } = await supabase
        .from('users')
        .update({ 
          credits_remaining: newCreditAmount,
          tier: 'pro' // Automatically set to pro when adding credits
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error adding credits:', error);
        toast.error('Failed to add credits');
        return;
      }

      // Refetch user data to update the UI
      refetchUser();
      
      toast.success(`Successfully added ${creditAmount} credits! Total: ${newCreditAmount}`);
      
      // Reset credit amount
      setCreditAmount(10);
    } catch (error) {
      console.error('Unexpected error adding credits:', error);
      toast.error('Unexpected error occurred');
    } finally {
      setIsAddingCredits(false);
    }
  };

  const resetDailyGenerations = async () => {
    if (!user) {
      toast.error('No user logged in');
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .update({ 
          daily_generations: 0,
          last_generation_date: null
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error resetting daily generations:', error);
        toast.error('Failed to reset daily generations');
        return;
      }

      refetchUser();
      toast.success('Daily generations reset successfully!');
    } catch (error) {
      console.error('Unexpected error resetting daily generations:', error);
      toast.error('Unexpected error occurred');
    }
  };

  const setUserTier = async (tier: 'free' | 'pro') => {
    if (!user) {
      toast.error('No user logged in');
      return;
    }

    try {
      const updates: any = { tier };
      
      // If setting to pro and user has no credits, give them some
      if (tier === 'pro' && user.credits_remaining === 0) {
        updates.credits_remaining = 100;
      }
      
      // If setting to free, reset credits
      if (tier === 'free') {
        updates.credits_remaining = 0;
      }

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (error) {
        console.error('Error updating user tier:', error);
        toast.error('Failed to update user tier');
        return;
      }

      refetchUser();
      toast.success(`User tier updated to ${tier.toUpperCase()}`);
    } catch (error) {
      console.error('Unexpected error updating user tier:', error);
      toast.error('Unexpected error occurred');
    }
  };

  const toggleAllowAllAspectRatios = () => {
    setAllowAllAspectRatios(!allowAllAspectRatios);
    
    // Store the setting in localStorage so it persists
    localStorage.setItem('debug_allow_all_aspect_ratios', (!allowAllAspectRatios).toString());
    
    // Dispatch a custom event to notify the LogoGenerator component
    window.dispatchEvent(new CustomEvent('debugAllowAllAspectRatios', {
      detail: { allowed: !allowAllAspectRatios }
    }));
    
    toast.success(`All aspect ratios ${!allowAllAspectRatios ? 'unlocked' : 'locked'} for debugging`);
  };

  const toggleAllowVideoTabForFree = () => {
    setAllowVideoTabForFree(!allowVideoTabForFree);
    
    // Store the setting in localStorage so it persists
    localStorage.setItem('debug_allow_video_tab_for_free', (!allowVideoTabForFree).toString());
    
    // Dispatch a custom event to notify the Dashboard component
    window.dispatchEvent(new CustomEvent('debugAllowVideoTabForFree', {
      detail: { allowed: !allowVideoTabForFree }
    }));
    
    toast.success(`Video tab ${!allowVideoTabForFree ? 'unlocked' : 'locked'} for free users`);
  };

  // Initialize the settings from localStorage on component mount
  React.useEffect(() => {
    const storedAspectRatios = localStorage.getItem('debug_allow_all_aspect_ratios');
    if (storedAspectRatios === 'true') {
      setAllowAllAspectRatios(true);
      // Dispatch event on mount if setting is enabled
      window.dispatchEvent(new CustomEvent('debugAllowAllAspectRatios', {
        detail: { allowed: true }
      }));
    }

    const storedVideoTab = localStorage.getItem('debug_allow_video_tab_for_free');
    if (storedVideoTab === 'true') {
      setAllowVideoTabForFree(true);
      // Dispatch event on mount if setting is enabled
      window.dispatchEvent(new CustomEvent('debugAllowVideoTabForFree', {
        detail: { allowed: true }
      }));
    }
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-900 text-white rounded-lg shadow-xl border border-gray-700 max-w-sm"
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-2 px-4 py-2 w-full text-left hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Bug className="h-4 w-4" />
          <span className="text-sm font-medium">Debug Panel</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-gray-700 p-4 space-y-4 max-w-sm"
            >
              {/* Auth Status */}
              <div>
                <h4 className="text-xs font-semibold text-gray-300 mb-1">Auth Status</h4>
                <div className="text-xs space-y-1">
                  <div>Step: <span className="text-yellow-400">{authStep}</span></div>
                  <div>Loading: <span className={loading ? 'text-yellow-400' : 'text-green-400'}>{loading.toString()}</span></div>
                  <div>User: <span className={user ? 'text-green-400' : 'text-red-400'}>{user ? 'Authenticated' : 'Not authenticated'}</span></div>
                  {error && <div>Error: <span className="text-red-400">{error}</span></div>}
                </div>
              </div>

              {/* User Data */}
              {user && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-300 mb-1">User Data</h4>
                  <div className="text-xs space-y-1">
                    <div>ID: <span className="text-blue-400">{user.id.slice(0, 8)}...</span></div>
                    <div>Email: <span className="text-blue-400">{user.email}</span></div>
                    <div>Tier: <span className="text-blue-400">{user.tier}</span></div>
                    <div>Credits: <span className="text-blue-400">{user.credits_remaining}</span></div>
                    <div>Daily Gen: <span className="text-blue-400">{user.daily_generations}</span></div>
                  </div>
                </div>
              )}

              {/* Subscription Data */}
              {subscription && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-300 mb-1">Subscription</h4>
                  <div className="text-xs">
                    Status: <span className="text-purple-400">{subscription.subscription_status}</span>
                  </div>
                </div>
              )}

              {/* Debug Features */}
              <div className="space-y-3 pt-2 border-t border-gray-700">
                <h4 className="text-xs font-semibold text-gray-300">Debug Features</h4>
                
                {/* Allow All Aspect Ratios Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-300">Allow All Aspect Ratios</span>
                  <button
                    onClick={toggleAllowAllAspectRatios}
                    className={`flex items-center space-x-1 text-xs px-2 py-1 rounded transition-colors ${
                      allowAllAspectRatios 
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    <Unlock className="h-3 w-3" />
                    <span>{allowAllAspectRatios ? 'Enabled' : 'Disabled'}</span>
                  </button>
                </div>
                
                {allowAllAspectRatios && (
                  <div className="text-xs text-green-400 bg-green-900/20 p-2 rounded">
                    🔓 All aspect ratios are unlocked for free users
                  </div>
                )}

                {/* Allow Video Tab for Free Users Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-300">Allow Video Tab (Free)</span>
                  <button
                    onClick={toggleAllowVideoTabForFree}
                    className={`flex items-center space-x-1 text-xs px-2 py-1 rounded transition-colors ${
                      allowVideoTabForFree 
                        ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    <Video className="h-3 w-3" />
                    <span>{allowVideoTabForFree ? 'Enabled' : 'Disabled'}</span>
                  </button>
                </div>
                
                {allowVideoTabForFree && (
                  <div className="text-xs text-purple-400 bg-purple-900/20 p-2 rounded">
                    🎬 Video tab is unlocked for free users
                  </div>
                )}
              </div>

              {/* Credit Management */}
              {user && (
                <div className="space-y-3 pt-2 border-t border-gray-700">
                  <h4 className="text-xs font-semibold text-gray-300">Credit Management</h4>
                  
                  {/* Add Credits */}
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(parseInt(e.target.value) || 10)}
                        className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-white"
                        disabled={isAddingCredits}
                      />
                      <button
                        onClick={addCredits}
                        disabled={isAddingCredits}
                        className="flex items-center space-x-1 text-xs bg-green-600 hover:bg-green-700 px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isAddingCredits ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        <span>Add Credits</span>
                      </button>
                    </div>
                    
                    {/* Quick Credit Buttons */}
                    <div className="flex space-x-1">
                      {[10, 50, 100].map((amount) => (
                        <button
                          key={amount}
                          onClick={() => {
                            setCreditAmount(amount);
                            setTimeout(() => addCredits(), 100);
                          }}
                          disabled={isAddingCredits}
                          className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors disabled:opacity-50"
                        >
                          +{amount}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tier Management */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-gray-400">User Tier</h5>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => setUserTier('free')}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          user.tier === 'free' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        Free
                      </button>
                      <button
                        onClick={() => setUserTier('pro')}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          user.tier === 'pro' 
                            ? 'bg-yellow-600 text-white' 
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        Pro
                      </button>
                    </div>
                  </div>

                  {/* Reset Daily Generations */}
                  <button
                    onClick={resetDailyGenerations}
                    className="text-xs bg-orange-600 hover:bg-orange-700 px-2 py-1 rounded transition-colors w-full"
                  >
                    Reset Daily Generations
                  </button>
                </div>
              )}

              {/* System Actions */}
              <div className="space-y-2 pt-2 border-t border-gray-700">
                <h4 className="text-xs font-semibold text-gray-300">System Actions</h4>
                
                <button
                  onClick={refetchUser}
                  className="flex items-center space-x-2 text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded transition-colors w-full"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Refetch User</span>
                </button>
                
                <button
                  onClick={testConnection}
                  className="text-xs bg-green-600 hover:bg-green-700 px-2 py-1 rounded transition-colors w-full"
                >
                  Test DB Connection
                </button>
                
                <button
                  onClick={clearAuthData}
                  className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded transition-colors w-full"
                >
                  Clear Auth Data
                </button>
              </div>

              {/* Environment Info */}
              <div className="pt-2 border-t border-gray-700">
                <h4 className="text-xs font-semibold text-gray-300 mb-1">Environment</h4>
                <div className="text-xs space-y-1">
                  <div>Supabase URL: <span className="text-gray-400">{import.meta.env.VITE_SUPABASE_URL?.slice(0, 20)}...</span></div>
                  <div>Anon Key: <span className="text-gray-400">{import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Missing'}</span></div>
                  <div>Fireworks API: <span className="text-gray-400">{import.meta.env.VITE_FIREWORKS_API_KEY ? 'Set' : 'Missing'}</span></div>
                  <div>PiAPI Key: <span className="text-gray-400">{import.meta.env.VITE_PIAPI_API_KEY ? 'Set' : 'Missing'}</span></div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};