import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, 
  Upload, 
  Play, 
  Download, 
  Loader2, 
  FileVideo, 
  Image as ImageIcon,
  Type,
  Settings,
  Sparkles,
  Clock,
  Monitor,
  Smartphone,
  Square,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Wand2,
  Crown
} from 'lucide-react';
import { 
  generateTextToVideo, 
  generateImageToVideo, 
  checkVideoStatus,
  downloadVideo,
  isVideoGenerationAvailable,
  videoStylePresets,
  validateImageFile,
  formatDuration,
  type TextToVideoRequest,
  type ImageToVideoRequest,
  type VideoGenerationResponse,
  type VideoGenerationJob
} from '../../lib/piapi';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

type GenerationMode = 'text-to-video' | 'image-to-video';

export const VideoGenerator: React.FC = () => {
  const { user, canGenerate, getRemainingGenerations, refetchUser, getUserTier } = useAuth();
  const [mode, setMode] = useState<GenerationMode>('text-to-video');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideos, setGeneratedVideos] = useState<VideoGenerationJob[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [debugAllowVideoTabForFree, setDebugAllowVideoTabForFree] = useState(false);
  
  // Text-to-video state
  const [textPrompt, setTextPrompt] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof videoStylePresets>('product-showcase');
  
  // Image-to-video state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState('');
  
  // Generation settings
  const [duration, setDuration] = useState(15);
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [style, setStyle] = useState<'cinematic' | 'animated' | 'realistic' | 'artistic'>('realistic');
  const [motionStrength, setMotionStrength] = useState<'low' | 'medium' | 'high'>('medium');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const userTier = getUserTier();
  const isProUser = userTier === 'pro';
  const isAvailable = isVideoGenerationAvailable();

  // Listen for debug events to allow video generation for free users
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

  // Handle preset selection
  const handlePresetSelect = (presetKey: keyof typeof videoStylePresets) => {
    const preset = videoStylePresets[presetKey];
    setSelectedPreset(presetKey);
    setDuration(preset.duration);
    setAspectRatio(preset.aspectRatio);
    setStyle(preset.style);
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
    const formData = new FormData();
    formData.append('file', file);
    
    // For demo purposes, return a placeholder URL
    // In production, you'd upload to your storage service
    return URL.createObjectURL(file);
  };

  // Generate video
  const handleGenerate = async () => {
    if (!user) {
      toast.error('Please sign in to generate videos');
      return;
    }

    if (!isProUser && !debugAllowVideoTabForFree) {
      toast.error('Video generation is available for Pro users only');
      return;
    }

    if (!canGenerate() && !debugAllowVideoTabForFree) {
      toast.error('No credits remaining');
      return;
    }

    if (mode === 'text-to-video' && !textPrompt.trim()) {
      toast.error('Please enter a text prompt');
      return;
    }

    if (mode === 'image-to-video' && !selectedImage) {
      toast.error('Please select an image');
      return;
    }

    setIsGenerating(true);

    try {
      let response: VideoGenerationResponse;
      let jobData: Partial<VideoGenerationJob>;

      if (mode === 'text-to-video') {
        const request: TextToVideoRequest = {
          prompt: textPrompt,
          duration,
          resolution,
          style,
          aspectRatio,
        };

        response = await generateTextToVideo(request);
        jobData = {
          type: 'text-to-video',
          request,
        };
      } else {
        // Upload image first
        const imageUrl = await uploadImageForVideo(selectedImage!);
        
        const request: ImageToVideoRequest = {
          imageUrl,
          prompt: imagePrompt,
          duration,
          resolution,
          motionStrength,
          aspectRatio,
        };

        response = await generateImageToVideo(request);
        jobData = {
          type: 'image-to-video',
          request,
        };
      }

      // Create job record
      const job: VideoGenerationJob = {
        id: response.id,
        ...jobData,
        status: response.status,
        createdAt: Date.now(),
        videoUrl: response.videoUrl,
        thumbnailUrl: response.thumbnailUrl,
        progress: response.progress || 0,
        error: response.error,
      } as VideoGenerationJob;

      setGeneratedVideos(prev => [job, ...prev]);

      // Save to database
      const { error: dbError } = await supabase
        .from('video_generations')
        .insert({
          user_id: user.id,
          video_type: mode,
          message: mode === 'text-to-video' ? textPrompt : imagePrompt,
          video_id: response.id,
          video_url: response.videoUrl || '',
        });

      if (dbError) {
        console.error('Database error:', dbError);
      }

      // Update user credits only if not in debug mode
      if (!debugAllowVideoTabForFree && isProUser) {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            credits_remaining: Math.max(0, user.credits_remaining - 1),
          })
          .eq('id', user.id);

        if (updateError) {
          console.error('Update error:', updateError);
        }

        refetchUser();
      }

      if (debugAllowVideoTabForFree) {
        toast.success('Video generation started! (Debug mode - no credits deducted)');
      } else {
        toast.success('Video generation started!');
      }

      // Poll for completion if not already completed
      if (response.status === 'processing' || response.status === 'pending') {
        pollVideoStatus(response.id);
      }

    } catch (error: any) {
      console.error('Video generation error:', error);
      toast.error(error.message || 'Failed to generate video');
    } finally {
      setIsGenerating(false);
    }
  };

  // Poll video status
  const pollVideoStatus = async (videoId: string) => {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        const status = await checkVideoStatus(videoId);
        
        setGeneratedVideos(prev => prev.map(job => 
          job.id === videoId 
            ? { 
                ...job, 
                status: status.status,
                progress: status.progress || job.progress,
                videoUrl: status.videoUrl || job.videoUrl,
                thumbnailUrl: status.thumbnailUrl || job.thumbnailUrl,
                error: status.error,
                completedAt: status.status === 'completed' ? Date.now() : job.completedAt,
              }
            : job
        ));

        if (status.status === 'completed') {
          toast.success('Video generation completed!');
          return;
        }

        if (status.status === 'failed') {
          toast.error('Video generation failed');
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000); // Poll every 5 seconds
        } else {
          toast.error('Video generation timed out');
        }
      } catch (error) {
        console.error('Status polling error:', error);
      }
    };

    poll();
  };

  // Download video
  const handleDownload = async (job: VideoGenerationJob) => {
    if (!job.videoUrl) {
      toast.error('Video not available for download');
      return;
    }

    try {
      const filename = `video-${job.type}-${Date.now()}.mp4`;
      await downloadVideo(job.videoUrl, filename);
      toast.success('Video downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download video');
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
            AI video generation is available for Pro users. Upgrade to create stunning videos from text prompts and images.
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg font-semibold hover:from-yellow-500 hover:to-orange-600 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            Upgrade to Pro
          </motion.button>
        </div>
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Service Not Available</h2>
          <p className="text-gray-600 mb-4">
            Video generation requires a PiAPI key to be configured.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto">
            <p className="text-sm text-gray-700 mb-2">To enable this feature:</p>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>Sign up for an account at PiAPI</li>
              <li>Get your API key from the dashboard</li>
              <li>Add <code className="bg-gray-200 px-1 rounded">VITE_PIAPI_API_KEY</code> to your environment variables</li>
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
        </div>

        {/* Credits Display */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
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
            <div className="flex items-center space-x-2">
              {debugAllowVideoTabForFree && (
                <div className="flex items-center space-x-2 px-3 py-2 bg-purple-100 text-purple-800 rounded-full border border-purple-200">
                  <span className="text-sm">🔓</span>
                  <span className="font-medium text-sm">Debug Mode</span>
                </div>
              )}
              {isProUser && (
                <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800 rounded-full border border-yellow-200">
                  <Crown className="h-5 w-5" />
                  <span className="font-medium">Pro User</span>
                </div>
              )}
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
                
                {/* Style Presets */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Video Style Preset
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {Object.entries(videoStylePresets).map(([key, preset]) => (
                      <motion.button
                        key={key}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handlePresetSelect(key as keyof typeof videoStylePresets)}
                        className={`p-3 rounded-lg text-left transition-all duration-200 ${
                          selectedPreset === key
                            ? 'bg-indigo-100 border-2 border-indigo-500 text-indigo-700'
                            : 'bg-white border border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-medium text-sm">{preset.name}</div>
                        <div className="text-xs text-gray-500 mt-1">{preset.description}</div>
                        <div className="text-xs mt-1 opacity-75">
                          {formatDuration(preset.duration)} • {preset.aspectRatio}
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Text Prompt */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Video Description
                  </label>
                  <textarea
                    value={textPrompt}
                    onChange={(e) => setTextPrompt(e.target.value)}
                    placeholder="Describe the video you want to create. Be specific about scenes, actions, style, and mood. Example: 'A sleek product showcase of a modern smartphone rotating slowly on a minimalist white background with soft lighting and subtle reflections.'"
                    className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    maxLength={500}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-sm text-gray-500">
                      Be specific about scenes, actions, and visual style for best results
                    </p>
                    <span className="text-sm text-gray-400">
                      {textPrompt.length}/500
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
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>

                {/* Animation Prompt */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Animation Description (Optional)
                  </label>
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Describe how you want the image to be animated. Example: 'Add gentle swaying motion to the trees and flowing movement to the water, with soft lighting changes.'"
                    className="w-full h-24 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    maxLength={200}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-sm text-gray-500">
                      Leave empty for automatic animation detection
                    </p>
                    <span className="text-sm text-gray-400">
                      {imagePrompt.length}/200
                    </span>
                  </div>
                </div>

                {/* Motion Strength */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Motion Strength
                  </label>
                  <div className="flex space-x-4">
                    {(['low', 'medium', 'high'] as const).map((strength) => (
                      <button
                        key={strength}
                        onClick={() => setMotionStrength(strength)}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          motionStrength === strength
                            ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                            : 'bg-white border border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {strength.charAt(0).toUpperCase() + strength.slice(1)}
                      </button>
                    ))}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duration
              </label>
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <input
                  type="range"
                  min="5"
                  max="30"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-12">{duration}s</span>
              </div>
            </div>

            {/* Resolution */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Resolution
              </label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setResolution('720p')}
                  className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg transition-colors ${
                    resolution === '720p'
                      ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                      : 'bg-white border border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <Monitor className="h-4 w-4" />
                  <span>720p</span>
                </button>
                <button
                  onClick={() => setResolution('1080p')}
                  className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg transition-colors ${
                    resolution === '1080p'
                      ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                      : 'bg-white border border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <Monitor className="h-4 w-4" />
                  <span>1080p</span>
                </button>
              </div>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Aspect Ratio
              </label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setAspectRatio('16:9')}
                  className={`flex-1 flex items-center justify-center space-x-1 py-2 px-2 rounded-lg transition-colors ${
                    aspectRatio === '16:9'
                      ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                      : 'bg-white border border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <Monitor className="h-3 w-3" />
                  <span className="text-xs">16:9</span>
                </button>
                <button
                  onClick={() => setAspectRatio('9:16')}
                  className={`flex-1 flex items-center justify-center space-x-1 py-2 px-2 rounded-lg transition-colors ${
                    aspectRatio === '9:16'
                      ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                      : 'bg-white border border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <Smartphone className="h-3 w-3" />
                  <span className="text-xs">9:16</span>
                </button>
                <button
                  onClick={() => setAspectRatio('1:1')}
                  className={`flex-1 flex items-center justify-center space-x-1 py-2 px-2 rounded-lg transition-colors ${
                    aspectRatio === '1:1'
                      ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                      : 'bg-white border border-gray-300 hover:border-gray-400'
                  }`}
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
                {mode === 'text-to-video' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Visual Style
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(['cinematic', 'animated', 'realistic', 'artistic'] as const).map((styleOption) => (
                        <button
                          key={styleOption}
                          onClick={() => setStyle(styleOption)}
                          className={`p-3 rounded-lg text-center transition-colors ${
                            style === styleOption
                              ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                              : 'bg-white border border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <div className="font-medium text-sm capitalize">{styleOption}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Generate Button */}
        <div className="text-center">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleGenerate}
            disabled={
              isGenerating || 
              (!canGenerate() && !debugAllowVideoTabForFree) ||
              (mode === 'text-to-video' && !textPrompt.trim()) ||
              (mode === 'image-to-video' && !selectedImage)
            }
            className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Generating Video...</span>
              </>
            ) : (
              <>
                <Video className="h-5 w-5" />
                <span>
                  Generate Video {debugAllowVideoTabForFree ? '(Debug Mode)' : '(1 credit)'}
                </span>
              </>
            )}
          </motion.button>
        </div>

        {/* Generated Videos */}
        {generatedVideos.length > 0 && (
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Generated Videos</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {generatedVideos.map((job) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-xl p-4 shadow-md border border-gray-200"
                >
                  <div className="aspect-video bg-gray-100 rounded-lg mb-4 relative overflow-hidden">
                    {job.status === 'completed' && job.videoUrl ? (
                      <video
                        src={job.videoUrl}
                        poster={job.thumbnailUrl}
                        controls
                        className="w-full h-full object-cover"
                      />
                    ) : job.thumbnailUrl ? (
                      <img
                        src={job.thumbnailUrl}
                        alt="Video thumbnail"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileVideo className="h-12 w-12 text-gray-400" />
                      </div>
                    )}
                    
                    {/* Status Overlay */}
                    {job.status !== 'completed' && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        {job.status === 'processing' ? (
                          <div className="text-center text-white">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                            <p className="text-sm">Processing...</p>
                            {job.progress && (
                              <p className="text-xs">{job.progress}%</p>
                            )}
                          </div>
                        ) : job.status === 'failed' ? (
                          <div className="text-center text-white">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm">Failed</p>
                          </div>
                        ) : (
                          <div className="text-center text-white">
                            <Clock className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm">Pending</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {job.type.replace('-', ' ')}
                        </span>
                        <div className="flex items-center space-x-1">
                          {job.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                          {job.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                          {job.status === 'failed' && <AlertCircle className="h-4 w-4 text-red-500" />}
                          <span className="text-xs text-gray-500 capitalize">{job.status}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600">
                        {new Date(job.createdAt).toLocaleString()}
                      </p>
                    </div>

                    {job.status === 'completed' && job.videoUrl && (
                      <button
                        onClick={() => handleDownload(job)}
                        className="w-full flex items-center justify-center space-x-2 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <Download className="h-4 w-4" />
                        <span>Download</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};