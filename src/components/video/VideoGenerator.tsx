import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  // downloadVideo, // This might be handled locally or differently
  isVideoGenerationAvailable,
  validateImageFile,
  formatDuration,
  type TextToVideoRequest, // Updated import
  type ImageToVideoRequest, // Updated import
  // type VideoGenerationResponse, // Replaced by TaskStatusResponse
  // type VideoGenerationJob // Will be simplified or removed for active task
  type CreateTaskResponse, // New from piapi.ts
  type TaskStatusResponse // New from piapi.ts
} from '../../lib/piapi';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

type GenerationMode = 'text-to-video' | 'image-to-video';

export const VideoGenerator: React.FC = () => {
  const { user, canGenerate, getRemainingGenerations, refetchUser, getUserTier } = useAuth();
  const [mode, setMode] = useState<GenerationMode>('text-to-video');
  // const [isGenerating, setIsGenerating] = useState(false); // Replaced by status
  // const [generatedVideos, setGeneratedVideos] = useState<VideoGenerationJob[]>([]); // To be refactored for single active task or new history
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [debugAllowVideoTabForFree, setDebugAllowVideoTabForFree] = useState(false);

  // New state variables for polling UI
  const [status, setStatus] = useState<'idle' | 'pending' | 'processing' | 'completed' | 'failed'>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
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

  // useEffect for polling cleanup
  useEffect(() => {
      return () => {
          if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
          }
      };
  }, []);

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
// Place this inside your VideoGenerator component

const uploadImageForVideo = async (file: File): Promise<string> => {
    if (!user) throw new Error("User not authenticated for image upload.");

    const fileName = `${user.id}/${Date.now()}-${file.name}`;
    
    // Upload file to Supabase Storage in the 'video-inputs' bucket
    // Make sure you have created a bucket named 'video-inputs' in your Supabase project.
    const { data, error } = await supabase.storage
        .from('video-inputs')
        .upload(fileName, file);

    if (error) {
        console.error("Supabase storage error:", error);
        throw new Error("Failed to upload image.");
    }
    
    // Get the public URL of the uploaded file
    const { data: { publicUrl } } = supabase.storage
        .from('video-inputs')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error("Could not get public URL for the uploaded image.");
    }

    return publicUrl;
};

  const startPolling = (currentTaskId: string) => {
      if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
      }

      pollingIntervalRef.current = setInterval(async () => {
          try {
              const statusResponse = await checkVideoStatus(currentTaskId); // from piapi.ts
              setProgress(statusResponse.progress || 0);

              if (statusResponse.status === 'completed') {
                  if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
                  setStatus('completed');
                  setFinalVideoUrl(statusResponse.video_url || null); // Ensure it handles undefined video_url
                  toast.success('Video generation completed!');
              } else if (statusResponse.status === 'failed') {
                  if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
                  setStatus('failed');
                  setErrorMessage(statusResponse.error || 'Video generation failed.');
                  toast.error(statusResponse.error || 'Video generation failed.');
              } else if (statusResponse.status === 'processing' || statusResponse.status === 'pending') {
                  setStatus(statusResponse.status); // Update status if it changes e.g. from pending to processing
              }
              // If status is still 'pending' or 'processing', do nothing more, interval continues.

          } catch (error: any) {
              if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
              setStatus('failed');
              setErrorMessage(error.message || 'Error while checking video status.');
              toast.error(error.message || 'Error while checking video status.');
          }
      }, 5000); // Poll every 5 seconds
  };

  // Place this inside your VideoGenerator component

const handleGenerateSubmit = async () => {
    if (status === 'pending' || status === 'processing') {
        toast.warn('A video generation is already in progress.');
        return;
    }

    // Pre-generation checks remain the same...
    if (!user) {
        toast.error('Please sign in to generate videos');
        return;
    }
    if (!isProUser && !debugAllowVideoTabForFree) {
        toast.error('Video generation is available for Creator users only');
        return;
    }
    // ... other checks for credits, prompts, etc.

    // Reset state for a new job
    setStatus('pending');
    setTaskId(null);
    setProgress(0);
    setFinalVideoUrl(null);
    setErrorMessage('');
    if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
    }

    try {
        let createTaskResponse: CreateTaskResponse;

        if (mode === 'text-to-video') {
            // Build the request using only the parameters our new API function uses
            const request = {
                prompt: textPrompt,
                aspectRatio: aspectRatio,
                // negativePrompt: // You can add a state for this if you want a negative prompt input
            };
            createTaskResponse = await generateTextToVideo(request);
        } else { // image-to-video
            if (!selectedImage) throw new Error("Image not selected for image-to-video");
            
            // Upload the image to get a real public URL
            const imageUrl = await uploadImageForVideo(selectedImage);

            // Build the request using only the parameters our new API function uses
            const request = {
                imageUrl: imageUrl,
                prompt: imagePrompt || undefined,
                aspectRatio: aspectRatio,
                // negativePrompt: // Add if you have a state for this
            };
            createTaskResponse = await generateImageToVideo(request);
        }

        setTaskId(createTaskResponse.task_id);
        setStatus('processing'); // Task submitted, now processing

        // The rest of the function (database logic, credit deduction) is good and can remain.
        // ... (Supabase insert, credit update, toasts, etc.)

        startPolling(createTaskResponse.task_id);

    } catch (error: any) {
        setStatus('failed');
        setErrorMessage(error.message || 'Failed to submit video generation task.');
        toast.error(error.message || 'Failed to submit video generation task.');
    }
};

  // Download video (This function might need to be adapted or removed if piapi.ts changes)
  // For now, assume it's a local helper if needed for the final video URL.
  const handleDownloadLocal = async (videoUrl: string | null, filenamePrefix: string = 'video') => {
    if (!videoUrl) {
      toast.error('Video not available for download');
      return;
    }
    try {
      // Use a generic download approach if piapi.ts downloadVideo is removed/changed
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error('Network response was not ok.');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filenamePrefix}-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href); // Clean up
      toast.success('Video downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download video.');
    }
  };

  // const handleDownload = async (job: VideoGenerationJob) => { // Old handleDownload
  //    if (!job.videoUrl) {
  //      toast.error('Video not available for download');
  //      return;
  //   }
  //   try {
  //     const filename = `video-${job.type}-${Date.now()}.mp4`;
  //     await downloadVideo(job.videoUrl, filename); // This downloadVideo was from old piapi
  //     toast.success('Video downloaded successfully!');
  //   } catch (error) {
  //     console.error('Download error:', error);
  //     toast.error('Failed to download video');
  //   }
  // };

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
                   
                  </div>
                )}
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
                (!debugAllowVideoTabForFree && !canGenerate()) ||
                (mode === 'text-to-video' && !textPrompt.trim()) ||
                (mode === 'image-to-video' && !selectedImage)
              }
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
            >
              <Video className="h-5 w-5" />
              <span>Generate Video {debugAllowVideoTabForFree ? '(Debug Mode)' : '(1 credit)'}</span>
            </motion.button>
            {status === 'failed' && errorMessage && (
              <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5" />
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
        ) : status === 'pending' || status === 'processing' ? (
          <div className="text-center p-6 bg-blue-50 rounded-xl border border-blue-200">
            <Loader2 className="h-10 w-10 text-blue-600 mx-auto mb-3 animate-spin" />
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              {status === 'pending' ? 'Initializing Video Generation...' : 'Your video is being created...'}
            </h3>
            <p className="text-sm text-blue-700 mb-1">Status: <span className="font-medium">{status}</span></p>
            {taskId && <p className="text-xs text-blue-600 mb-3">Task ID: {taskId}</p>}
            <div className="w-full bg-blue-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-blue-700 mt-2">{progress}% complete</p>
          </div>
        ) : status === 'completed' && finalVideoUrl ? (
          <div className="text-center p-6 bg-green-50 rounded-xl border border-green-200">
            <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-green-900 mb-4">Generation Complete!</h3>
            <div className="aspect-video bg-gray-800 rounded-lg mb-4 overflow-hidden shadow-lg">
              <video src={finalVideoUrl} controls className="w-full h-full object-contain" />
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
                  setTaskId(null);
                  setProgress(0);
                  // Optionally reset prompts
                  // setTextPrompt('');
                  // setImagePrompt('');
                  // setSelectedImage(null);
                  // setImagePreview(null);
                }}
                className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-all duration-200 shadow-md hover:shadow-lg flex items-center space-x-2"
              >
                <RefreshCw className="h-5 w-5" />
                <span>Start New Video</span>
              </motion.button>
            </div>
          </div>
        ) : null}

        {/* Generated Videos History (Commented out for now to focus on active task) */}
        {/* {generatedVideos.length > 0 && (
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Generated Videos</h3>
            { ... existing map logic ... }
          </div>
        )} */}
      </div>
    </div>
  );
};