import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, User } from '../lib/supabase';
import { getUserSubscription } from '../lib/stripe';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isEmailVerified: boolean;
  resendVerificationEmail: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data: userProfile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      return userProfile;
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      return null;
    }
  };

  const refreshUser = async () => {
    if (!user) return;
    
    try {
      const updatedProfile = await fetchUserProfile(user.id);
      if (updatedProfile) {
        setUser(updatedProfile);
        setIsEmailVerified(updatedProfile.is_email_verified || false);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  const resendVerificationEmail = async () => {
    if (!user) {
      toast.error('No user found');
      return;
    }

    try {
      // Call Supabase's built-in resend function
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
      });

      if (error) {
        console.error('Error resending verification email:', error);
        toast.error('Failed to resend verification email');
        return;
      }

      toast.success('Verification email sent! Please check your inbox.');
    } catch (error) {
      console.error('Error in resendVerificationEmail:', error);
      toast.error('Failed to resend verification email');
    }
  };

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          setLoading(false);
          return;
        }

        if (session?.user) {
          const userProfile = await fetchUserProfile(session.user.id);
          if (userProfile) {
            setUser(userProfile);
            setIsEmailVerified(userProfile.is_email_verified || false);
          }
        }
      } catch (error) {
        console.error('Error in getInitialSession:', error);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id);

        if (event === 'SIGNED_IN' && session?.user) {
          const userProfile = await fetchUserProfile(session.user.id);
          if (userProfile) {
            setUser(userProfile);
            setIsEmailVerified(userProfile.is_email_verified || false);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsEmailVerified(false);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Refresh user profile on token refresh
          await refreshUser();
        }

        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Check for email verification on URL hash change (when user clicks verification link)
  useEffect(() => {
    const handleHashChange = async () => {
      const hash = window.location.hash;
      
      if (hash.includes('type=email_change') || hash.includes('type=signup')) {
        // User clicked verification link, refresh their profile
        setTimeout(async () => {
          await refreshUser();
          toast.success('Email verified successfully!');
        }, 1000);
      }
    };

    // Check on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [user]);

  const value: AuthContextType = {
    user,
    loading,
    isEmailVerified,
    resendVerificationEmail,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};