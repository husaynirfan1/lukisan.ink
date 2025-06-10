import React from 'react';
import { Dashboard } from '../pages/Dashboard';
import { SuccessPage } from './SuccessPage';
import { CancelPage } from './CancelPage';
import { AuthCallback } from './auth/AuthCallback';
import { VerificationSuccessPage } from './VerificationSuccessPage';
import { VerificationErrorPage } from './VerificationErrorPage';
import { Hero } from './Hero';
import { useAuth } from '../hooks/useAuth';

export const Router: React.FC = () => {
  const { user, loading } = useAuth();
  const path = window.location.pathname;

  // Handle special routes first
  if (path === '/success') {
    return <SuccessPage />;
  }
  
  if (path === '/cancel') {
    return <CancelPage />;
  }

  if (path === '/auth/callback') {
    return <AuthCallback />;
  }

  // Email verification routes
  if (path === '/verify-email') {
    // This will be handled by the backend function
    window.location.href = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-email${window.location.search}`;
    return <div>Redirecting...</div>;
  }

  if (path === '/verification-success') {
    return <VerificationSuccessPage />;
  }

  if (path === '/verification-error') {
    return <VerificationErrorPage />;
  }

  // Dashboard routes
  if (path.startsWith('/dashboard')) {
    return <Dashboard />;
  }

  // Home page - show Hero for unauthenticated users, redirect to dashboard for authenticated users
  if (path === '/') {
    if (loading) {
      return null; // Let App.tsx handle loading state
    }
    
    if (user) {
      // Redirect authenticated users to dashboard
      window.history.replaceState(null, '', '/dashboard');
      return <Dashboard />;
    }
    
    // Show hero for unauthenticated users
    return <Hero />;
  }

  // 404 - redirect to home
  window.history.replaceState(null, '', '/');
  return user ? <Dashboard /> : <Hero />;
};