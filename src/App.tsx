import React, { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { Header } from './components/Header';
import { Router } from './components/Router';
import { DebugPanel } from './components/DebugPanel';
import { DashboardLoader } from './components/DashboardLoader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './hooks/useAuth';

function App() {
  const { user, loading, error, authStep } = useAuth();

  // Handle authentication-based redirects
  useEffect(() => {
    if (user && !loading) {
      const path = window.location.pathname;
      
      // Redirect authenticated users from home to dashboard
      if (path === '/') {
        console.log('[APP] Authenticated user on home page, redirecting to dashboard');
        window.history.replaceState(null, '', '/dashboard');
      }
    }
  }, [user, loading]);

  // Show loading screen during authentication
  if (loading) {
    let stage: 'initializing' | 'authenticating' | 'loading_profile' | 'loading_data' | 'complete' = 'initializing';
    let message = '';

    switch (authStep) {
      case 'initializing':
      case 'checking_session':
        stage = 'initializing';
        break;
      case 'signing_in':
      case 'signing_up':
        stage = 'authenticating';
        break;
      case 'fetching_profile':
      case 'creating_profile':
        stage = 'loading_profile';
        break;
      case 'loading_subscription':
        stage = 'loading_data';
        break;
      default:
        if (authStep.includes('error') || authStep.includes('timeout')) {
          message = 'Taking longer than expected...';
        }
    }

    return <DashboardLoader stage={stage} message={message} />;
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#fff',
              color: '#333',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            },
          }}
        />
        
        <Header />
        
        {/* Show error state */}
        {error && !loading && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <h2 className="text-xl font-semibold text-red-800 mb-2">Authentication Error</h2>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        )}
        
        {/* Main Content Router */}
        {!error && (
          <ErrorBoundary fallback={
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Page Error</h2>
              <p className="text-gray-600 mb-4">There was an error loading this page.</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Refresh Page
              </button>
            </div>
          }>
            <Router />
          </ErrorBoundary>
        )}
        
        {/* Debug Panel (development only) */}
        <DebugPanel />
        
        {/* Footer */}
        <footer className="bg-white/60 backdrop-blur-sm border-t border-gray-200/50 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center text-gray-600">
              <p>&copy; 2025 Lukisan. Powered by cutting-edge AI technology.</p>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

export default App;