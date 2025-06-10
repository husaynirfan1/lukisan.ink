import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Download, Loader2, User, Crown, Wand2, RefreshCw, AlertTriangle, Lock } from 'lucide-react';
import { generateLogo, refinePrompt } from '../lib/fireworks';
import { 
  storeTempImage, 
  checkUserCredits,
  getTempImages,
  getOrCreateGuestSession,
  cleanupExpiredTempImages,
  TempImage 
} from '../lib/guestImageManager';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { AuthModal } from './auth/AuthModal';
import toast from 'react-hot-toast';

const categories = [
  { 
    id: 'tech', 
    name: 'Tech & Digital', 
    icon: '💻', 
    description: 'Modern, clean designs for technology companies',
    placeholder: 'A cutting-edge AI software company that develops machine learning solutions for healthcare'
  },
  { 
    id: 'professional', 
    name: 'Professional', 
    icon: '👔', 
    description: 'Sophisticated logos for business and consulting',
    placeholder: 'A premium consulting firm specializing in strategic business transformation and executive coaching'
  },
  { 
    id: 'sports', 
    name: 'Sports & Fitness', 
    icon: '⚽', 
    description: 'Dynamic designs for athletic brands',
    placeholder: 'A high-performance fitness gym focused on strength training and athletic conditioning'
  },
  { 
    id: 'minimalist', 
    name: 'Minimalist', 
    icon: '◯', 
    description: 'Simple, elegant designs with clean lines',
    placeholder: 'A luxury lifestyle brand that creates premium home accessories and modern furniture'
  },
  { 
    id: 'abstract', 
    name: 'Abstract', 
    icon: '🎨', 
    description: 'Creative, artistic interpretations',
    placeholder: 'An innovative creative agency that specializes in digital art and experimental design'
  },
  { 
    id: 'nature', 
    name: 'Nature & Organic', 
    icon: '🌿', 
    description: 'Earth-friendly and natural themes',
    placeholder: 'An organic skincare company that uses sustainable ingredients and eco-friendly packaging'
  },
  { 
    id: 'food', 
    name: 'Food & Beverage', 
    icon: '🍕', 
    description: 'Appetizing designs for culinary brands',
    placeholder: 'A gourmet coffee roastery that sources premium beans from sustainable farms worldwide'
  },
];

interface GeneratedLogo {
  url: string;
  category: string;
  prompt: string;
  timestamp: number;
  tempImageId?: string;
  hasInsufficientCredits?: boolean;
}

export const GuestLogoGenerator: React.FC = () => {
  const { user, refetchUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [generatedLogo, setGeneratedLogo] = useState<GeneratedLogo | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<GeneratedLogo | null>(null);
  const [userCredits, setUserCredits] = useState<{
    available: number;
    isProUser: boolean;
    canGenerate: boolean;
  } | null>(null);

  // Track if we've already generated a logo in this session to prevent duplicates
  const hasGeneratedInSession = useRef(false);

  // Get the selected category's placeholder
  const selectedCategoryData = categories.find(cat => cat.id === selectedCategory);
  const currentPlaceholder = selectedCategoryData?.placeholder || 'e.g., A modern tech company specializing in cloud computing solutions...';

  // Check user credits when user changes
  useEffect(() => {
    if (user) {
      checkUserCredits(user.id).then(setUserCredits);
    } else {
      setUserCredits(null);
    }
  }, [user]);

  // Cleanup expired images on component mount
  useEffect(() => {
    cleanupExpiredTempImages();
  }, []);

  // Prevent right-click context menu on logo images
  const handleImageRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please sign in to download this logo', {
        icon: '🔒',
        duration: 3000,
      });
    }
    return false;
  };

  // Prevent drag and drop of logo images
  const handleImageDragStart = (e: React.DragEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please sign in to download this logo', {
        icon: '🔒',
        duration: 2000,
      });
    }
    return false;
  };

  // Prevent image selection
  const handleImageSelect = (e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  };

  const handleRefinePrompt = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a description first');
      return;
    }

    if (!selectedCategory) {
      toast.error('Please select a category first');
      return;
    }

    setIsRefining(true);
    
    try {
      const refinedPrompt = await refinePrompt({
        originalPrompt: prompt,
        category: selectedCategory,
      });

      setPrompt(refinedPrompt);
      toast.success('Prompt refined successfully!');
    } catch (error) {
      toast.error('Failed to refine prompt. Please try again.');
      console.error('Prompt refinement error:', error);
    } finally {
      setIsRefining(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a description for your logo');
      return;
    }

    if (!selectedCategory) {
      toast.error('Please select a category');
      return;
    }

    // Check user credits if authenticated
    if (user && userCredits && !userCredits.canGenerate) {
      toast.error('Not enough credits to generate logo', {
        icon: '💳',
        duration: 4000,
      });
      return;
    }

    // Prevent duplicate generation in the same session
    if (hasGeneratedInSession.current && generatedLogo) {
      console.log('Logo already generated in this session, skipping duplicate generation');
      return;
    }

    setIsGenerating(true);
    setGeneratedLogo(null);
    
    try {
      console.log('=== STARTING GUEST LOGO GENERATION ===');
      console.log('User authenticated:', !!user);
      console.log('Prompt:', prompt);
      console.log('Category:', selectedCategory);
      
      const logoUrl = await generateLogo({
        prompt: prompt,
        category: selectedCategory,
        size: '1024x1024',
        aspectRatio: '1:1',
        guidanceScale: 3.5,
        numInferenceSteps: 30,
        seed: Math.floor(Math.random() * 2147483647)
      });

      console.log('Logo generated successfully:', logoUrl);

      const newLogo: GeneratedLogo = {
        url: logoUrl,
        category: selectedCategory,
        prompt: prompt,
        timestamp: Date.now(),
      };

      // Store as temporary image for guest users OR authenticated users
      console.log('Storing image for future transfer...');
      const storeResult = await storeTempImage({
        imageUrl: logoUrl,
        prompt: prompt,
        category: selectedCategory,
        aspectRatio: '1:1'
      });

      if (storeResult.success && storeResult.tempImage) {
        newLogo.tempImageId = storeResult.tempImage.id;
        console.log('Successfully stored temporary image:', storeResult.tempImage.id);
      } else {
        console.warn('Failed to store temporary image:', storeResult.error);
      }

      setGeneratedLogo(newLogo);
      hasGeneratedInSession.current = true; // Mark that we've generated in this session
      toast.success('Logo generated successfully!');
      console.log('=== GUEST LOGO GENERATION COMPLETED ===');
      
    } catch (error) {
      console.error('=== GUEST LOGO GENERATION FAILED ===');
      console.error('Generation error:', error);
      toast.error('Failed to generate logo. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (logo: GeneratedLogo) => {
    if (!user) {
      // Store the logo for download after sign-in
      setPendingDownload(logo);
      setShowAuthModal(true);
      toast('Please sign in to download your logo', {
        icon: '🔐',
        duration: 3000,
      });
      return;
    }

    // Check if user has insufficient credits for this logo
    if (logo.hasInsufficientCredits) {
      toast.error('Not enough credits to download this logo', {
        icon: '💳',
        duration: 4000,
      });
      return;
    }

    try {
      const filename = `logo-${logo.category}-${Date.now()}.png`;
      
      // Create download link
      const link = document.createElement('a');
      
      if (logo.url.startsWith('blob:')) {
        link.href = logo.url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const response = await fetch(logo.url, {
          mode: 'cors',
          headers: { 'Accept': 'image/*' },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
      
      toast.success('Logo downloaded successfully!');
      
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download logo. Please try right-clicking and saving the image.');
    }
  };
  
  // Enhanced auth success handler
  const handleAuthSuccess = () => {
    console.log('=== AUTH SUCCESS IN GUEST GENERATOR ===');
    setShowAuthModal(false);
    
    // The useAuth hook will automatically handle the transfer
    // Handle pending download if any
    if (pendingDownload) {
      // Small delay to ensure auth state is updated
      setTimeout(() => {
        handleDownload(pendingDownload);
        setPendingDownload(null);
      }, 2000);
    }
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const category = categories.find(cat => cat.id === categoryId);
    if (category && !prompt.trim()) {
      setPrompt('');
    }
  };

  return (
    <>
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/80 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-gray-200/50">
          <div className="space-y-8">
            {/* User Credits Display */}
            {user && userCredits && (
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-200/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Crown className={`h-5 w-5 ${userCredits.isProUser ? 'text-yellow-500' : 'text-gray-400'}`} />
                    <div>
                      <p className="font-semibold text-gray-900">
                        {userCredits.isProUser ? 'Creator Account' : 'Free Account'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {userCredits.available} {userCredits.isProUser ? 'credits' : 'generations'} remaining
                      </p>
                    </div>
                  </div>
                  
                  {!userCredits.canGenerate && (
                    <div className="flex items-center space-x-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span>No credits</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Category Selection */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Choose a style</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((category) => (
                  <motion.button
                    key={category.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleCategorySelect(category.id)}
                    className={`p-4 rounded-xl text-left transition-all duration-200 ${
                      selectedCategory === category.id
                        ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg'
                        : 'bg-white hover:bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className="text-2xl mb-2">{category.icon}</div>
                    <h4 className="font-semibold mb-1">{category.name}</h4>
                    <p className={`text-sm ${
                      selectedCategory === category.id ? 'text-white/80' : 'text-gray-600'
                    }`}>
                      {category.description}
                    </p>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Prompt Input */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label htmlFor="guest-prompt" className="block text-lg font-semibold text-gray-900">
                  Describe your logo
                  {selectedCategoryData && (
                    <span className="text-sm font-normal text-gray-600 ml-2">
                      ({selectedCategoryData.name} style)
                    </span>
                  )}
                </label>
                
                {/* Refine Prompt Button */}
                {prompt.trim() && selectedCategory && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRefinePrompt}
                    disabled={isRefining}
                    className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRefining ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Refining...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        <span className="text-sm">Refine with AI</span>
                      </>
                    )}
                  </motion.button>
                )}
              </div>
              
              <textarea
                id="guest-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={currentPlaceholder}
                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
              
              <div className="mt-3 flex items-start justify-between">
                <div className="text-sm text-gray-500">
                  <strong>Tip:</strong> Be specific about your business, industry, and desired style for best results.
                </div>
                
                {prompt.trim() && selectedCategory && (
                  <div className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-md">
                    💡 Try the AI refinement feature above
                  </div>
                )}
              </div>
            </div>

            {/* Generate Button */}
            <div className="text-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleGenerate}
                disabled={
                  isGenerating || 
                  !prompt.trim() || 
                  !selectedCategory || 
                  (user && userCredits && !userCredits.canGenerate) ||
                  (hasGeneratedInSession.current && generatedLogo) // Prevent duplicate generation
                }
                className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Generating your logo...</span>
                  </>
                ) : user && userCredits && !userCredits.canGenerate ? (
                  <>
                    <Lock className="h-5 w-5" />
                    <span>No Credits Available</span>
                  </>
                ) : hasGeneratedInSession.current && generatedLogo ? (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <span>Logo Generated</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <span>{user ? 'Generate Logo' : 'Generate Logo - Free'}</span>
                  </>
                )}
              </motion.button>
              
              {user && userCredits && !userCredits.canGenerate && (
                <p className="text-red-600 text-sm mt-2">
                  {userCredits.isProUser 
                    ? 'No credits remaining. Please upgrade your plan.' 
                    : 'Daily limit reached. Try again tomorrow or upgrade to Creator.'
                  }
                </p>
              )}
            </div>

            {/* Generated Logo */}
            <AnimatePresence>
              {generatedLogo && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 border border-gray-200/50"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-900">Your Generated Logo</h3>
                    {generatedLogo.hasInsufficientCredits && (
                      <div className="flex items-center space-x-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Insufficient Credits</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Logo Display with Protection */}
                    <div className="bg-white rounded-xl p-6 shadow-sm">
                      <div className="aspect-square bg-gray-50 rounded-lg p-4 mb-4 flex items-center justify-center relative">
                        {/* Protected Logo Image */}
                        <img
                          src={generatedLogo.url}
                          alt="Generated logo"
                          className={`max-w-full max-h-full object-contain rounded-lg select-none pointer-events-none ${
                            generatedLogo.hasInsufficientCredits ? 'filter grayscale opacity-60' : ''
                          }`}
                          onContextMenu={handleImageRightClick}
                          onDragStart={handleImageDragStart}
                          onSelectStart={handleImageSelect}
                          draggable={false}
                          style={{
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                            WebkitTouchCallout: 'none',
                            WebkitUserDrag: 'none',
                            KhtmlUserSelect: 'none'
                          }}
                        />
                        
                        {/* Invisible overlay to prevent interactions for non-authenticated users */}
                        {!user && (
                          <div 
                            className="absolute inset-0 bg-transparent cursor-not-allowed"
                            onContextMenu={handleImageRightClick}
                            onDragStart={handleImageDragStart}
                            onSelectStart={handleImageSelect}
                            style={{ userSelect: 'none' }}
                          />
                        )}
                        
                        {/* Watermark overlay for non-authenticated users */}
                        {!user && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-black/10 text-white/60 px-3 py-1 rounded-lg text-xs font-medium backdrop-blur-sm">
                              Sign in to download
                            </div>
                          </div>
                        )}
                        
                        {/* Insufficient credits overlay */}
                        {generatedLogo.hasInsufficientCredits && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-red-500/20 text-red-700 px-3 py-1 rounded-lg text-xs font-medium backdrop-blur-sm border border-red-300">
                              Not enough credits
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="text-center">
                        <h4 className="font-semibold text-gray-900 mb-1">Square Format (1:1)</h4>
                        <p className="text-sm text-gray-600 capitalize">{generatedLogo.category} style</p>
                      </div>
                    </div>

                    {/* Logo Info & Actions */}
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Logo Details</h4>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm text-gray-700 mb-2">
                            <strong>Style:</strong> {selectedCategoryData?.name}
                          </p>
                          <p className="text-sm text-gray-700 mb-2">
                            <strong>Description:</strong> {generatedLogo.prompt.length > 100 
                              ? `${generatedLogo.prompt.substring(0, 100)}...` 
                              : generatedLogo.prompt}
                          </p>
                          <p className="text-sm text-gray-700">
                            <strong>Generated:</strong> {new Date(generatedLogo.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Download Section */}
                      <div className={`rounded-lg p-4 border ${
                        generatedLogo.hasInsufficientCredits 
                          ? 'bg-red-50 border-red-200' 
                          : 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200/50'
                      }`}>
                        {generatedLogo.hasInsufficientCredits ? (
                          <div className="text-center">
                            <AlertTriangle className="h-8 w-8 text-red-600 mx-auto mb-2" />
                            <h5 className="font-semibold text-gray-900 mb-2">Insufficient Credits</h5>
                            <p className="text-sm text-gray-600 mb-4">
                              You don't have enough credits to download this logo. Upgrade to Creator or wait for daily reset.
                            </p>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              disabled
                              className="w-full py-3 bg-gray-300 text-gray-500 rounded-lg font-semibold cursor-not-allowed flex items-center justify-center space-x-2"
                            >
                              <Lock className="h-4 w-4" />
                              <span>Download Locked</span>
                            </motion.button>
                          </div>
                        ) : !user ? (
                          <div className="text-center">
                            <User className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
                            <h5 className="font-semibold text-gray-900 mb-2">Sign in to Download</h5>
                            <p className="text-sm text-gray-600 mb-4">
                              Create a free account to download your logo and save it to your library
                            </p>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleDownload(generatedLogo)}
                              className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                            >
                              <Download className="h-4 w-4" />
                              <span>Sign In & Download</span>
                            </motion.button>
                          </div>
                        ) : (
                          <div className="text-center">
                            <Crown className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                            <h5 className="font-semibold text-gray-900 mb-2">Ready to Download</h5>
                            <p className="text-sm text-gray-600 mb-4">
                              Your logo is ready for download and has been saved to your library
                            </p>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleDownload(generatedLogo)}
                              className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                            >
                              <Download className="h-4 w-4" />
                              <span>Download PNG</span>
                            </motion.button>
                          </div>
                        )}
                      </div>

                      {/* Try Another Button */}
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setGeneratedLogo(null);
                          hasGeneratedInSession.current = false; // Reset generation flag
                        }}
                        className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        <span>Generate Another</span>
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Call to Action */}
            {!user && (
              <div className="text-center bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-200/50">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Love what you see?</h3>
                <p className="text-gray-600 mb-4">
                  Sign up for free to download your logos, access your library, and get 3 free generations daily!
                </p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowAuthModal(true)}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Get Started Free
                </motion.button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Enhanced AuthModal with proper success handling */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
};