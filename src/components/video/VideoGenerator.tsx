import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, Upload, Play, Download, Loader2, FileVideo, Image as ImageIcon,
  Type, Settings, Sparkles, Clock, Monitor, Smartphone, Square, 
  AlertTriangle, CheckCircle, RefreshCw, Wand2, Crown, Bell, BellOff, Info, CreditCard
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { 
  generateTextToVideo, 
  generateImageToVideo, 
  AspectRatio,
  isVideoGenerationAvailable,
  validateImageFile,
  requestNotificationPermission,
  showVideoCompleteNotification,
  type TextToVideoRequest,
  type ImageToVideoRequest
} from '../../lib/piapi';
import { videoProcessingService } from '../../lib/videoProcessingService';
import { AIPromptRefiner } from './AIPromptRefiner';
import { VideoPresets } from './VideoPresets';
import toast from 'react-hot-toast';

type GenerationMode = 'text-to-video' | 'image-to-video';

const CREDITS_PER_VIDEO = 3; // Define the credit cost per video generation

export const VideoGenerator: React.FC = () => {
  const { user, canGenerate, getRemainingGenerations, refetchUser, getUserTier } = useAuth();
  const [mode, setMode] = useState<GenerationMode>('text-to-video');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [debugAllowVideoTabForFree, setDebugAllowVideoTabForFree] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Status tracking state
  const [status, setStatus] = useState<'idle' | 'pending' | 'processing' | 'downloading' | 'storing' | 'completed' | 'failed'>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [finalThumbnailUrl, setFinalThumbnailUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Text-to-video state
  const [textPrompt, setTextPrompt] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<any | null>(null);
  
  // Image-to-video state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState('');
  
  // Generation settings
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.The169);
  const [negativePrompt, setNegativePrompt] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const userTier = getUserTier();
  const isProUser = userTier === 'pro';
  const isAvailable = isVideoGenerationAvailable();

  // Check if user has enough credits for video generation
  const hasEnoughCredits = () => {
    if (debugAllowVideoTabForFree) return true;
    if (!user) return false;
    
    const remainingCredits = getRemainingGenerations();
    return remainingCredits >= CREDITS_PER_VIDEO;
  };

  // Check notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Listen for debug events to allow video generation for free users
  useEffect(() => {
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

  // Handle preset selection
  const handlePresetSelect = (preset: any) => {
    setSelectedPreset(preset);
    setTextPrompt(preset.prompt);
    setNegativePrompt(preset.negative_prompt);
  };

  // Handle image upload
  const handleImageUpload = useCallback((file: File) => {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error || 'Invalid image file');
      return;
    }

    setSelectedImage(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleImageUpload(file);
    }
  }, [handleImageUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Upload image to get URL
  const uploadImageForVideo = async (file: File): Promise<string> => {
    if (!user) throw new Error("User not authenticated for image upload.");

    const fileName = `${user.id}/${Date.now()}-${file.name}`;
    
    const { data, error } = await supabase.storage
        .from('video-inputs')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false, // Don't overwrite existing files
          contentType: file.type
        });

    if (error) {
        console.error("Supabase storage error:", error);
        throw new Error("Failed to upload image.");
    }
    
    const { data: { publicUrl } } = supabase.storage
        .from('video-inputs')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error("Could not get public URL for the uploaded image.");
    }

    return publicUrl;
  };

  // Handle notification permission request
  const handleNotificationToggle = async () => {
    if (notificationsEnabled) {
      // Can't revoke permission programmatically, just update state
      setNotificationsEnabled(false);
      toast.info('Notifications disabled for this session');
    } else {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
      if (granted) {
        toast.success('Notifications enabled! You\'ll be notified when your video is ready.');
      } else {
        toast.error('Notification permission denied. You can enable it in your browser settings.');
      }
    }
  };

  const handleGenerateSubmit = async () => {
    if (status === 'pending' || status === 'processing') {
        toast.error('A video generation is already in progress.');
        return;
    }

    if (!user) {
        toast.error('Please sign in to generate videos');
        return;
    }
    
    if (!isProUser && !debugAllowVideoTabForFree) {
        toast.error('Video generation is available for Creator users only');
        return;
    }

    // Check if PiAPI is properly configured
    const PIAPI_API_KEY = import.meta.env.VITE_PIAPI_API_KEY;
    if (!PIAPI_API_KEY || PIAPI_API_KEY === 'your_piapi_api_key_here') {
        toast.error('PiAPI key not configured. Please add your API key to the .env file to enable video generation.', {
            duration: 8000,
            icon: '⚠️'
        });
        return;
    }

    // Check if user has enough credits
    if (!hasEnoughCredits()) {
        const remainingCredits = getRemainingGenerations();
        toast.error(`Not enough credits. Video generation requires ${CREDITS_PER_VIDEO} credits, but you only have ${remainingCredits}.`, {
            icon: '💳',
            duration: 5000,
        });
        return;
    }

    if (mode === 'text-to-video' && !textPrompt.trim()) {
      toast.error('Please enter a video description');
      return;
    }

    if (mode === 'image-to-video' && !selectedImage) {
      toast.error('Please upload an image for video generation');
      return;
    }

    // Request notification permission if not already granted
    if (!notificationsEnabled && 'Notification' in window) {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
    }

    // Reset state for a new job
    setStatus('pending');
    setTaskId(null);
    setVideoId(null);
    setProgress(0);
    setFinalVideoUrl(null);
    setFinalThumbnailUrl(null);
    setErrorMessage('');

    try {
        let createTaskResponse;

        console.log(`[VideoGenerator] Starting ${mode} generation`);

        if (mode === 'text-to-video') {
            const request: TextToVideoRequest = {
                prompt: textPrompt,
                aspectRatio: aspectRatio,
                negativePrompt: negativePrompt || undefined,
            };
            createTaskResponse = await generateTextToVideo(request);
        } else {
            if (!selectedImage) throw new Error("Image not selected for image-to-video");
            
            const imageUrl = await uploadImageForVideo(selectedImage);

            const request: ImageToVideoRequest = {
                imageUrl: imageUrl,
                prompt: imagePrompt || 'Animate this image with natural motion',
                aspectRatio: aspectRatio,
                negativePrompt: negativePrompt || undefined,
            };
            createTaskResponse = await generateImageToVideo(request);
        }

        // Validate the task_id
        const validTaskId = createTaskResponse.task_id.trim();
        setTaskId(validTaskId);
        setStatus('processing');

        console.log(`[VideoGenerator] Task created successfully: ${validTaskId}`);

        // Save to database with processing status
        try {
            const { data, error: dbError } = await supabase
              .from("video_generations")
              .insert({
                user_id: user.id,
                video_type: mode === 'text-to-video' ? 'marketing' : 'welcome',
                message: mode === 'text-to-video' ? textPrompt : imagePrompt || 'Image animation',
                video_id: validTaskId,
                video_url: null, // Allow NULL during processing
                status: 'processing',
                progress: 0
              })
              .select('id')
              .single();

            if (dbError) {
              console.error('Database error:', dbError);
              throw new Error(`Database error: ${dbError.message}`);
            }

            const videoDbId = data.id;
            setVideoId(videoDbId);
            console.log(`[VideoGenerator] Created video record: ${videoDbId}`);
            
            // Start processing with the video processing service
            videoProcessingService.startProcessing(validTaskId, videoDbId, user.id);
        } catch (dbError) {
            console.error('Database insertion failed:', dbError);
            throw new Error('Failed to save video generation record');
        }

        // Update user credits - DEDUCT 3 CREDITS
        try {
            if (isProUser) {
              const { error: updateError } = await supabase
                .from('users')
                .update({
                  credits_remaining: Math.max(0, user.credits_remaining - CREDITS_PER_VIDEO),
                })
                .eq('id', user.id);

              if (updateError) {
                console.error('Credits update error:', updateError);
              }
            } else {
              // For free users, update daily generations (if debug mode allows)
              if (debugAllowVideoTabForFree) {
                const today = new Date().toISOString();
                const { data: userData, error: fetchError } = await supabase
                  .from('users')
                  .select('daily_generations, last_generation_date')
                  .eq('id', user.id)
                  .single();

                if (!fetchError && userData) {
                  const todayDate = today.split('T')[0];
                  const lastGenDate = userData.last_generation_date?.split('T')[0];
                  
                  const newDailyCount = lastGenDate === todayDate 
                    ? userData.daily_generations + CREDITS_PER_VIDEO 
                    : CREDITS_PER_VIDEO;

                  const { error: updateError } = await supabase
                    .from('users')
                    .update({
                      daily_generations: newDailyCount,
                      last_generation_date: today
                    })
                    .eq('id', user.id);

                  if (updateError) {
                    console.error('Daily generations update error:', updateError);
                  }
                }
              }
            }

            refetchUser();
        } catch (creditError) {
            console.error('Credit update failed:', creditError);
            // Don't throw here - the video generation can still proceed
        }

        toast.success(`Video generation started! (${CREDITS_PER_VIDEO} credits used)`);
        
        // Offer to navigate to video library
        setTimeout(() => {
          toast.success('Your video is being processed. You can view its status in the Video Library.', {
            duration: 5000,
            icon: '🎬'
          });
          
          // Offer to navigate to video library
          toast((t) => (
            <div className="flex flex-col space-y-2">
              <div>Would you like to go to the Video Library to track progress?</div>
              <div className="flex space-x-2 justify-end">
                <button
                  onClick={() => {
                    toast.dismiss(t.id);
                    window.history.pushState(
                      { tab: 'video-library', taskId: validTaskId }, 
                      '', 
                      '/dashboard/video-library'
                    );
                    window.dispatchEvent(new PopStateEvent('popstate', { 
                      state: { tab: 'video-library', taskId: validTaskId }
                    }));
                  }}
                  className="px-3 py-1 bg-purple-600 text-white rounded-md text-sm flex items-center space-x-1"
                >
                  <Video className="h-3 w-3" />
                  <span>Go to Library</span>
                </button>
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="px-3 py-1 bg-gray-200 rounded-md text-sm"
                >
                  Stay Here
                </button>
              </div>
            </div>
          ), {
            duration: 10000,
          });
        }, 3000);

    } catch (error: any) {
        console.error('Video generation error:', error);
        setStatus('failed');
        
        // Enhanced error handling
        let userFriendlyMessage = 'Failed to submit video generation task.';
        
        if (error.message?.includes('PiAPI key not configured')) {
            userFriendlyMessage = 'PiAPI key not configured. Please add your API key to the .env file.';
        } else if (error.message?.includes('insufficient credits')) {
            userFriendlyMessage = 'Insufficient credits on your PiAPI account. Please top up your credits.';
        } else if (error.message?.includes('failed to find task')) {
            userFriendlyMessage = 'Task not found on PiAPI. Please try again.';
        } else if (error.message?.includes('Failed to fetch')) {
            userFriendlyMessage = 'Network error. Please check your internet connection and try again.';
        }
        
        setErrorMessage(userFriendlyMessage);
        toast.error(userFriendlyMessage);
    }
  };

  // Download video
  const handleDownloadLocal = async (videoUrl: string | null, filenamePrefix: string = 'video') => {
    if (!videoUrl) {
      toast.error('Video not available for download');
      return;
    }
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filenamePrefix}-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Video downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download video.');
    }
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <Video className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">AI Video Generation</h2>
          <p className="text-gray-600">Sign in to start creating videos</p>
        </div>
      </div>
    );
  }

  if (!isProUser && !debugAllowVideoTabForFree) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl p-8 border border-yellow-200/50 text-center">
          <Crown className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Pro Feature</h2>
          <p className="text-gray-600 mb-6">
            AI video generation is available for Creator users. Upgrade to create stunning videos from text prompts and images.
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg font-semibold hover:from-yellow-500 hover:to-orange-600 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            Upgrade to Creator
          </motion.button>
        </div>
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <AlertTriangle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Service Not Available</h2>
          <p className="text-gray-600 mb-4">
            Video generation requires a PiAPI key to be configured.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto">
            <p className="text-sm text-gray-700 mb-2">To enable this feature:</p>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>Sign up for an account at <a href="https://piapi.ai/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">PiAPI</a></li>
              <li>Get your API key from the dashboard</li>
              <li>Replace <code className="bg-gray-200 px-1 rounded">your_piapi_api_key_here</code> in your .env file with your actual API key</li>
              <li>Purchase credits on your PiAPI account for video generation</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">AI Video Generation</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Create stunning marketing videos from text prompts or transform your images into dynamic video content.
          </p>
          <div className="mt-4 text-sm text-gray-500">
            <span className="font-medium">Resolution:</span> 480p • <span className="font-medium">Frames:</span> 85 frames
          </div>
        </div>

        {/* Credits Display */}
        {/* <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Your Account</h3>
              <p className="text-gray-600">
                {debugAllowVideoTabForFree 
                  ? 'Debug mode: Unlimited video generation'
                  : isProUser 
                    ? `${getRemainingGenerations()} credits remaining this month`
                    : `${getRemainingGenerations()} generations remaining today`
                }
              </p> 
            </div>
 */}
{/* --- NEW, IMPROVED ACCOUNT CARD --- */}
<div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
    
    {/* Left Side: Info and Progress */}
    <div className="w-full sm:w-2/3">
      <div className="flex items-center space-x-2 mb-1">
        <h3 className="text-lg font-semibold text-gray-800">
          {isProUser ? 'Monthly Credits' : 'Daily Generations'}
        </h3>
        <div className="relative group">
          <Info className="h-5 w-5 text-gray-400 cursor-help" />
          <div className="absolute bottom-full mb-2 w-64 bg-gray-800 text-white text-sm rounded-lg py-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10">
            {isProUser 
              ? 'Your monthly credits reset after each month.' 
              : 'Your daily free generations reset at midnight.'
            }
            <br />
            <svg className="absolute text-gray-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255" xmlSpace="preserve"><polygon className="fill-current" points="0,0 127.5,127.5 255,0"/></svg>
          </div>
        </div>
      </div>
      
      <p className="text-5xl font-extrabold text-gray-900">{remainingCredits}</p>
      <p className="text-gray-500 mt-1">out of {totalCredits} remaining</p>
      
     <div className="mt-4">
       <div className="w-full bg-gray-200 rounded-full h-3">
         <div 
           className="bg-indigo-600 h-3 rounded-full transition-all duration-500 ease-out" 
           style={{ width: `${progressPercentage}%` }}
         ></div>
       </div>
     </div> 
    </div>
  </div>
</div> {/* This was the missing closing tag */}

        {/*------------*/}
        
         
            
            <div className="flex items-center space-x-2">
              {/* Notification Toggle */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleNotificationToggle}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                  notificationsEnabled 
                    ? 'bg-green-100 text-green-800 border border-green-300' 
                    : 'bg-gray-100 text-gray-600 border border-gray-300'
                }`}
              >
                {notificationsEnabled ? (
                  <Bell className="h-4 w-4" />
                ) : (
                  <BellOff className="h-4 w-4" />
                )}
                <span className="text-sm font-medium">
                  {notificationsEnabled ? 'Notifications On' : 'Enable Notifications'}
                </span>
              </motion.button>

              {debugAllowVideoTabForFree && (
                <div className="flex items-center space-x-2 px-3 py-2 bg-purple-100 text-purple-800 rounded-full border border-purple-200">
                  <span className="text-sm">🔓</span>
                  <span className="font-medium text-sm">Debug Mode</span>
                </div>
              )}
              
              {/* Credits needed indicator */}
              <div className={`px-3 py-2 rounded-lg ${
                hasEnoughCredits() 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                <p className="text-sm font-medium">
                  {CREDITS_PER_VIDEO} credits per video
                </p>
                <p className="text-xs">
                  {hasEnoughCredits() ? '✓ Sufficient credits' : '✗ Insufficient credits'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Mode Selection */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Generation Mode</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMode('text-to-video')}
              className={`p-6 rounded-xl text-left transition-all duration-200 ${
                mode === 'text-to-video'
                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg'
                  : 'bg-white hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <Type className="h-8 w-8 mb-3" />
              <h4 className="font-semibold mb-2">Text to Video</h4>
              <p className={`text-sm ${
                mode === 'text-to-video' ? 'text-white/80' : 'text-gray-600'
              }`}>
                Generate videos from detailed text descriptions
              </p>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMode('image-to-video')}
              className={`p-6 rounded-xl text-left transition-all duration-200 ${
                mode === 'image-to-video'
                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg'
                  : 'bg-white hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <ImageIcon className="h-8 w-8 mb-3" />
              <h4 className="font-semibold mb-2">Image to Video</h4>
              <p className={`text-sm ${
                mode === 'image-to-video' ? 'text-white/80' : 'text-gray-600'
              }`}>
                Animate your images with AI-powered motion
              </p>
            </motion.button>
          </div>
        </div>

        {/* Content Generation */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
          <AnimatePresence mode="wait">
            {mode === 'text-to-video' ? (
              <motion.div
                key="text-to-video"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <h3 className="text-lg font-semibold text-gray-900">Text to Video Generation</h3>
                
                {/* Video Presets */}
                <VideoPresets 
                  onPresetSelect={handlePresetSelect}
                  selectedPresetId={selectedPreset?.id}
                />

                {/* Text Prompt */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Video Description
                    </label>
                    <AIPromptRefiner
                      currentPrompt={textPrompt}
                      onRefinedPrompt={setTextPrompt}
                      disabled={status === 'pending' || status === 'processing'}
                    />
                  </div>
                  <textarea
                    value={textPrompt}
                    onChange={(e) => setTextPrompt(e.target.value)}
                    placeholder="Describe the video you want to create. Be specific about scenes, actions, style, and mood. Example: 'A sleek product showcase of a modern smartphone rotating slowly on a minimalist white background with soft lighting and subtle reflections.'"
                    className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    maxLength={1000}
                    disabled={status !== 'idle' && status !== 'failed'}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-sm text-gray-500">
                      Be specific about scenes, actions, and visual style for best results
                    </p>
                    <span className="text-sm text-gray-400">
                      {textPrompt.length}/1000
                    </span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="image-to-video"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <h3 className="text-lg font-semibold text-gray-900">Image to Video Generation</h3>
                
                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Upload Image
                  </label>
                  
                  {!selectedImage ? (
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-400 transition-colors cursor-pointer"
                    >
                      <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 mb-2">
                        Drag and drop an image here, or click to select
                      </p>
                      <p className="text-sm text-gray-500">
                        Supports JPEG, PNG, WebP up to 10MB
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileInputChange}
                        className="hidden"
                        disabled={status !== 'idle' && status !== 'failed'}
                      />
                    </div>
                  ) : (
                    <div className="relative">
                      <img
                        src={imagePreview!}
                        alt="Selected image"
                        className="w-full max-w-md mx-auto rounded-lg shadow-md"
                      />
                      <button
                        onClick={() => {
                          setSelectedImage(null);
                          setImagePreview(null);
                        }}
                        className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        disabled={status !== 'idle' && status !== 'failed'}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>

                {/* Animation Prompt */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Animation Description
                    </label>
                    <AIPromptRefiner
                      currentPrompt={imagePrompt}
                      onRefinedPrompt={setImagePrompt}
                      disabled={status === 'pending' || status === 'processing'}
                    />
                  </div>
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Describe how you want the image to be animated. Example: 'Add gentle swaying motion to the trees and flowing movement to the water, with soft lighting changes.'"
                    className="w-full h-24 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    maxLength={500}
                    disabled={status !== 'idle' && status !== 'failed'}
                  />
                  <div className="flex justify-between items-center mt-2">
                 
                    <span className="text-sm text-gray-400">
                      {imagePrompt.length}/500
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Advanced Settings */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Video Settings</h3>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <Settings className="h-4 w-4" />
              <span>{showAdvanced ? 'Hide' : 'Show'} Advanced</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Aspect Ratio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Aspect Ratio
              </label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setAspectRatio(AspectRatio.The169)}
                  className={`flex-1 flex items-center justify-center space-x-1 py-2 px-2 rounded-lg transition-colors ${
                    aspectRatio === AspectRatio.The169
                      ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                      : 'bg-white border border-gray-300 hover:border-gray-400'
                  }`}
                  disabled={status !== 'idle' && status !== 'failed'}
                >
                  <Monitor className="h-3 w-3" />
                  <span className="text-xs">16:9</span>
                </button>
                <button
                  onClick={() => setAspectRatio(AspectRatio.The916)}
                  className={`flex-1 flex items-center justify-center space-x-1 py-2 px-2 rounded-lg transition-colors ${
                    aspectRatio === AspectRatio.The916
                      ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                      : 'bg-white border border-gray-300 hover:border-gray-400'
                  }`}
                  disabled={status !== 'idle' && status !== 'failed'}
                >
                  <Smartphone className="h-3 w-3" />
                  <span className="text-xs">9:16</span>
                </button>
                <button
                  onClick={() => setAspectRatio(AspectRatio.The11)}
                  className={`flex-1 flex items-center justify-center space-x-1 py-2 px-2 rounded-lg transition-colors ${
                    aspectRatio === AspectRatio.The11
                      ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                      : 'bg-white border border-gray-300 hover:border-gray-400'
                  }`}
                  disabled={status !== 'idle' && status !== 'failed'}
                >
                  <Square className="h-3 w-3" />
                  <span className="text-xs">1:1</span>
                </button>
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 pt-6 border-t border-gray-200"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Negative Prompt (Optional)
                  </label>
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="Describe what you don't want in the video (e.g., 'blurry, low quality, distorted, shaky camera, poor lighting')"
                    className="w-full h-20 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    maxLength={200}
                    disabled={status !== 'idle' && status !== 'failed'}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-sm text-gray-500">
                      Help improve video quality by specifying what to avoid
                    </p>
                    <span className="text-sm text-gray-400">
                      {negativePrompt.length}/200
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Generate Button and Status Display */}
        {status === 'idle' || status === 'failed' ? (
          <div className="text-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleGenerateSubmit}
              disabled={
                (status === 'pending' || status === 'processing') ||
                (!debugAllowVideoTabForFree && !hasEnoughCredits()) ||
                (mode === 'text-to-video' && !textPrompt.trim()) ||
                (mode === 'image-to-video' && !selectedImage)
              }
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
            >
              <Video className="h-5 w-5" />
              <span>
                Generate Video {debugAllowVideoTabForFree ? '(Debug Mode)' : `(${CREDITS_PER_VIDEO} credits)`}
              </span>
            </motion.button>
            
            {!hasEnoughCredits() && !debugAllowVideoTabForFree && (
              <p className="text-red-600 text-sm mt-2">
                You need {CREDITS_PER_VIDEO} credits but only have {getRemainingGenerations()}
              </p>
            )}
            
            {status === 'failed' && errorMessage && (
              <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5" />
                  <p>Error: {errorMessage}</p>
                </div>
                <button
                  onClick={() => setStatus('idle')}
                  className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        ) : status === 'completed' && finalVideoUrl ? (
          <div id="completed-video" className="text-center p-6 bg-green-50 rounded-xl border border-green-200">
            <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-green-900 mb-4">Generation Complete!</h3>
            <div className="aspect-video bg-gray-800 rounded-lg mb-4 overflow-hidden shadow-lg max-w-2xl mx-auto">
              <video 
                src={finalVideoUrl} 
                controls 
                className="w-full h-full object-contain"
                poster={finalThumbnailUrl}
              />
            </div>
            <div className="flex space-x-3 justify-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleDownloadLocal(finalVideoUrl, mode === 'text-to-video' ? textPrompt.substring(0,20) : 'image-video')}
                className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center space-x-2"
              >
                <Download className="h-5 w-5" />
                <span>Download Video</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setStatus('idle');
                  setFinalVideoUrl(null);
                  setFinalThumbnailUrl(null);
                  setTaskId(null);
                  setVideoId(null);
                  setProgress(0);
                  setSelectedPreset(null);
                  setSelectedImage(null);
                  setImagePreview(null);
                  setTextPrompt('');
                  setImagePrompt('');
                }}
                className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-all duration-200 shadow-md hover:shadow-lg flex items-center space-x-2"
              >
                <RefreshCw className="h-5 w-5" />
                <span>Start New Video</span>
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="text-center p-6 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-center justify-center space-x-2 mb-3">
              <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
              <h3 className="text-lg font-semibold text-blue-900">
                {status === 'pending' ? 'Initializing Video Generation...' : 
                 status === 'downloading' ? 'Downloading Your Video...' :
                 status === 'storing' ? 'Saving to Your Library...' :
                 'Your video is being created...'}
              </h3>
            </div>
            
            <p className="text-sm text-blue-700 mb-1">Status: <span className="font-medium capitalize">{status}</span></p>
            {taskId && <p className="text-xs text-blue-600 mb-3">Task ID: {taskId}</p>}
            {videoId && <p className="text-xs text-blue-600 mb-3">Video ID: {videoId}</p>}
            
            <div className="w-full bg-blue-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-blue-700 mt-2">{progress}% complete</p>
            
            <div className="mt-4 text-xs text-blue-600">
              <p>Your video will be automatically saved to your library when complete.</p>
              {notificationsEnabled && (
                <p className="mt-1">
                  🔔 You'll be notified when your video is ready
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};