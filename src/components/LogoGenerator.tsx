import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Download, Loader2, Crown, Video, Wand2, RefreshCw, Lock, CreditCard, CheckSquare, Square, Cloud, Settings, Scissors, AlertTriangle, Info } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { generateLogo, refinePrompt } from '../lib/fireworks';
import { supabase } from '../lib/supabase';
import { storeImageInSupabase, downloadImageFromSupabase } from '../lib/imageStorage';
import { urlToBlob, handleSaveGeneratedLogo } from '../lib/logoSaver';
import { checkUserCredits } from '../lib/guestImageManager';
import { isBackgroundRemovalAvailable } from '../lib/backgroundRemoval';
import { SubscriptionCard } from './SubscriptionCard';
import { VideoCreator } from './video/VideoCreator';
import { AuthModal } from './auth/AuthModal';
import { BackgroundRemovalModal } from './BackgroundRemovalModal';
import toast from 'react-hot-toast';
import { PaymentButton } from './PaymentButton';

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
  { 
    id: 'real_estate', 
    name: 'Real Estate & Arch.', 
    icon: '🏢', 
    description: 'Solid designs for property and construction',
    placeholder: 'A luxury real estate agency that sells premium properties and modern architectural homes'
  },
  { 
    id: 'kids', 
    name: 'Kids & Toys', 
    icon: '🧸', 
    description: 'Fun, playful logos for children\'s brands',
    placeholder: 'A creative toy brand that makes educational and imaginative toys for young children'
  },
  // New "Futuristic" category below
  { 
    id: 'futuristic', 
    name: 'Futuristic', 
    icon: '🚀', 
    description: 'Sleek, advanced concepts for sci-fi and innovation',
    placeholder: 'A deep space exploration corporation that builds interstellar travel vehicles and warp drives'
  },
];

const aspectRatios = [
  { id: '1:1', name: 'Square', ratio: '1:1', description: 'Perfect for social media profiles', free: true },
  { id: '16:9', name: 'Landscape', ratio: '16:9', description: 'Great for headers and banners', free: true },
  { id: '9:16', name: 'Portrait', ratio: '9:16', description: 'Ideal for mobile and stories', free: true },
  { id: '4:3', name: 'Standard', ratio: '4:3', description: 'Classic presentation format', free: false },
  { id: '3:2', name: 'Photo', ratio: '3:2', description: 'Traditional photo proportions', free: false },
  { id: '21:9', name: 'Ultra Wide', ratio: '21:9', description: 'Cinematic banner format', free: false },
  { id: '5:4', name: 'Print', ratio: '5:4', description: 'Optimized for print materials', free: false },
  { id: '2:3', name: 'Poster', ratio: '2:3', description: 'Vertical poster format', free: false },
];

interface GeneratedLogo {
  aspectRatio: string;
  url: string; // Original generated URL
  storedUrl?: string; // Supabase Storage URL
  storagePath?: string; // Storage path for deletion
  name: string;
  ratio: string;
  isStoring?: boolean; // Loading state for storage
}

export const LogoGenerator: React.FC = () => {
  const { user, canGenerate, getRemainingGenerations, refetchUser, getUserTier } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedAspectRatios, setSelectedAspectRatios] = useState<string[]>(['1:1']); // Multiple selection
  const [guidanceScale, setGuidanceScale] = useState(3.5);
  const [numInferenceSteps, setNumInferenceSteps] = useState(30);
  const [seed, setSeed] = useState(-1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [generatedLogos, setGeneratedLogos] = useState<GeneratedLogo[]>([]); // Multiple logos
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showVideoCreator, setShowVideoCreator] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [debugAllowAllAspectRatios, setDebugAllowAllAspectRatios] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [userCredits, setUserCredits] = useState<{
    available: number;
    isProUser: boolean;
    canGenerate: boolean;
  } | null>(null);
  
  // Background removal modal state
  const [showBackgroundRemovalModal, setShowBackgroundRemovalModal] = useState(false);
  const [selectedLogoForBgRemoval, setSelectedLogoForBgRemoval] = useState<GeneratedLogo | null>(null);

  const userTier = getUserTier();
  const isProUser = userTier === 'pro';
  const isBgRemovalAvailable = isBackgroundRemovalAvailable();

  //credit ui update 
  const totalCredits = isProUser ? 30 : 3; // Example: 500 for pro, 5 daily for free
  const remainingCredits = getRemainingGenerations();
  const progressPercentage = totalCredits > 0 ? (remainingCredits / totalCredits) * 100 : 0;

  // Check user credits when user changes
  useEffect(() => {
    if (user) {
      checkUserCredits(user.id).then(setUserCredits);
    } else {
      setUserCredits(null);
    }
  }, [user]);

  // Listen for debug events to allow all aspect ratios
  useEffect(() => {
    const handleDebugEvent = (event: CustomEvent) => {
      setDebugAllowAllAspectRatios(event.detail.allowed);
    };

    // Check localStorage on mount
    const stored = localStorage.getItem('debug_allow_all_aspect_ratios');
    if (stored === 'true') {
      setDebugAllowAllAspectRatios(true);
    }

    window.addEventListener('debugAllowAllAspectRatios', handleDebugEvent as EventListener);
    
    return () => {
      window.removeEventListener('debugAllowAllAspectRatios', handleDebugEvent as EventListener);
    };
  }, []);

  // Get the selected category's placeholder
  const selectedCategoryData = categories.find(cat => cat.id === selectedCategory);
  const currentPlaceholder = selectedCategoryData?.placeholder || 'e.g., A modern tech company specializing in cloud computing solutions...';

  // Calculate total credits needed
const creditsNeeded = selectedAspectRatios.length;
// The line below was removed because 'remainingCredits' is already defined above
const canGenerateAll = remainingCredits >= creditsNeeded;

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

  const generateRandomSeed = () => {
    const randomSeed = Math.floor(Math.random() * 2147483647);
    setSeed(randomSeed);
    toast.success(`New random seed generated: ${randomSeed}`);
  };

  // Store image in Supabase Storage using the new function
  const storeLogoImage = async (logo: GeneratedLogo, index: number) => {
    if (!user || logo.storedUrl) return logo; // Already stored

    try {
      // Update UI to show storing state
      setGeneratedLogos(prev => prev.map((l, i) => 
        i === index ? { ...l, isStoring: true } : l
      ));

      // Convert URL to blob
      const imageBlob = await urlToBlob(logo.url);

      // Save using the new function
      const saveResult = await handleSaveGeneratedLogo({
        imageBlob: imageBlob,
        prompt: prompt,
        category: selectedCategory,
        userId: user.id,
        aspectRatio: logo.ratio
      });

      if (saveResult.success) {
        const updatedLogo = {
          ...logo,
          storedUrl: saveResult.publicUrl,
          storagePath: saveResult.storagePath,
          isStoring: false
        };

        // Update the logo in the array
        setGeneratedLogos(prev => prev.map((l, i) => 
          i === index ? updatedLogo : l
        ));

        console.log(`Logo ${index + 1} stored successfully in Supabase Storage`);
        return updatedLogo;
      } else {
        throw new Error(saveResult.error || 'Failed to save logo');
      }

    } catch (error) {
      console.error(`Failed to store logo ${index + 1}:`, error);
      
      // Update UI to remove storing state
      setGeneratedLogos(prev => prev.map((l, i) => 
        i === index ? { ...l, isStoring: false } : l
      ));

      // Don't throw error, just log it - user can still download original
      return logo;
    }
  };

  const handleGenerate = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    if (!prompt.trim()) {
      toast.error('Please enter a description for your logo');
      return;
    }

    if (!selectedCategory) {
      toast.error('Please select a category');
      return;
    }

    if (selectedAspectRatios.length === 0) {
      toast.error('Please select at least one aspect ratio');
      return;
    }

    // Check user credits before generation
    if (userCredits && !userCredits.canGenerate) {
      toast.error('Not enough credits to generate logos', {
        icon: '💳',
        duration: 4000,
      });
      return;
    }

    if (!canGenerateAll) {
      toast.error(`Not enough credits. You need ${creditsNeeded} credits but only have ${remainingCredits}.`);
      return;
    }

    // Check if user is trying to use Pro aspect ratios without Pro subscription
    const hasProRatios = selectedAspectRatios.some(ratioId => {
      const ratioData = aspectRatios.find(r => r.id === ratioId);
      return ratioData && !ratioData.free;
    });

    if (hasProRatios && !isProUser && !debugAllowAllAspectRatios) {
      toast.error('Premium aspect ratios are available for Creator users only');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: selectedAspectRatios.length });
    setGeneratedLogos([]);
    
    try {
      const generatedLogos: GeneratedLogo[] = [];
      const baseSeed = seed === -1 ? Math.floor(Math.random() * 2147483647) : seed;

      // Generate logos for each selected aspect ratio
      for (let i = 0; i < selectedAspectRatios.length; i++) {
        const aspectRatioId = selectedAspectRatios[i];
        const aspectRatioData = aspectRatios.find(r => r.id === aspectRatioId);
        
        if (!aspectRatioData) continue;

        setGenerationProgress({ current: i + 1, total: selectedAspectRatios.length });

        // Use the same base seed but add index to ensure slight variation
        const currentSeed = baseSeed + i;

        console.log(`Generating logo ${i + 1}/${selectedAspectRatios.length} for ${aspectRatioData.name} (${aspectRatioData.ratio})`);

        const logoUrl = await generateLogo({
          prompt: prompt,
          category: selectedCategory,
          size: '1024x1024',
          aspectRatio: aspectRatioId,
          guidanceScale: guidanceScale,
          numInferenceSteps: numInferenceSteps,
          seed: currentSeed
        });

        const generatedLogo: GeneratedLogo = {
          aspectRatio: aspectRatioId,
          url: logoUrl,
          name: aspectRatioData.name,
          ratio: aspectRatioData.ratio,
          isStoring: false
        };

        generatedLogos.push(generatedLogo);

        // Update the UI with the current logo immediately
        setGeneratedLogos([...generatedLogos]);
      }

      // Update user credits/daily count for all generations
      const today = new Date().toISOString();
      const updates: any = {
        last_generation_date: today,
      };

      if (isProUser) {
        updates.credits_remaining = Math.max(0, user.credits_remaining - creditsNeeded);
      } else {
        const todayDate = today.split('T')[0];
        const lastGenDate = user.last_generation_date?.split('T')[0];
        
        if (lastGenDate === todayDate) {
          updates.daily_generations = user.daily_generations + creditsNeeded;
        } else {
          updates.daily_generations = creditsNeeded;
        }
      }

      const { error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (updateError) {
        console.error('Update error:', updateError);
      }

      setGeneratedLogos(generatedLogos);
      refetchUser();
      
      // Update local credits state
      if (userCredits) {
        setUserCredits(prev => prev ? {
          ...prev,
          available: Math.max(0, prev.available - creditsNeeded),
          canGenerate: (prev.available - creditsNeeded) > 0
        } : null);
      }
      
      const ratioNames = selectedAspectRatios.map(id => {
        const ratio = aspectRatios.find(r => r.id === id);
        return ratio?.name || id;
      }).join(', ');
      
      toast.success(`${generatedLogos.length} logo variants generated successfully! (${ratioNames})`);
      
      // Store images in Supabase Storage in the background
      toast.loading('Storing high-quality images...', { id: 'storing-images' });
      
      // Store all images in parallel
      const storePromises = generatedLogos.map((logo, index) => 
        storeLogoImage(logo, index)
      );
      
      try {
        await Promise.all(storePromises);
        toast.success('High-quality images stored successfully!', { id: 'storing-images' });
      } catch (error) {
        console.error('Some images failed to store:', error);
        toast.success('Images generated! Some may use fallback download.', { id: 'storing-images' });
      }
      
    } catch (error) {
      toast.error('Failed to generate logos. Please try again.');
      console.error('Generation error:', error);
    } finally {
      setIsGenerating(false);
      setGenerationProgress({ current: 0, total: 0 });
    }
  };

  // Enhanced download function that uses stored images when available
  const downloadLogo = async (logo: GeneratedLogo, format: 'png' | 'svg') => {
    try {
      if (format === 'svg') {
        toast('SVG download coming soon!');
        return;
      }

      const filename = `logo-${logo.name.toLowerCase().replace(/\s+/g, '-')}-${logo.ratio.replace(':', 'x')}-${Date.now()}.png`;

      // Use stored URL if available, otherwise fall back to original
      const downloadUrl = logo.storedUrl || logo.url;
      
      if (logo.storedUrl) {
        console.log('Downloading from Supabase Storage:', logo.storedUrl);
        toast.loading('Downloading high-quality image...', { id: `download-${logo.aspectRatio}` });
        
        await downloadImageFromSupabase(logo.storedUrl, filename);
        toast.success(`${logo.name} logo downloaded in high quality!`, { id: `download-${logo.aspectRatio}` });
      } else {
        console.log('Downloading from original URL:', logo.url);
        toast.loading('Downloading image...', { id: `download-${logo.aspectRatio}` });
        
        // Fallback to original URL download
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
        
        toast.success(`${logo.name} logo downloaded!`, { id: `download-${logo.aspectRatio}` });
      }
      
    } catch (error) {
      console.error('Download error:', error);
      toast.error(`Failed to download ${logo.name} logo. Please try right-clicking and saving the image.`, { 
        id: `download-${logo.aspectRatio}` 
      });
    }
  };

  const downloadAllLogos = async () => {
    if (generatedLogos.length === 0) return;

    toast.success('Starting download of all logos...');
    
    for (let i = 0; i < generatedLogos.length; i++) {
      const logo = generatedLogos[i];
      
      // Add a small delay between downloads to prevent overwhelming the browser
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      await downloadLogo(logo, 'png');
    }
    
    toast.success(`All ${generatedLogos.length} logos downloaded!`);
  };

  // Handle background removal
  const handleRemoveBackground = (logo: GeneratedLogo) => {
    setSelectedLogoForBgRemoval(logo);
    setShowBackgroundRemovalModal(true);
  };

  // Handle category selection and update placeholder
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const category = categories.find(cat => cat.id === categoryId);
    if (category && !prompt.trim()) {
      setPrompt('');
    }
  };

  const handleAspectRatioToggle = (ratioId: string) => {
    const ratioData = aspectRatios.find(ratio => ratio.id === ratioId);
    
    // Check if it's a premium ratio and user doesn't have access
    if (ratioData && !ratioData.free && !isProUser && !debugAllowAllAspectRatios) {
      toast.error('Premium aspect ratios are available for Creator users only. Upgrade to unlock!');
      return;
    }
    
    setSelectedAspectRatios(prev => {
      if (prev.includes(ratioId)) {
        // Remove if already selected (but keep at least one)
        if (prev.length > 1) {
          return prev.filter(id => id !== ratioId);
        } else {
          toast.error('At least one aspect ratio must be selected');
          return prev;
        }
      } else {
        // Add if not selected
        return [...prev, ratioId];
      }
    });
  };

  const selectAllFreeRatios = () => {
    const freeRatios = aspectRatios.filter(ratio => ratio.free).map(ratio => ratio.id);
    setSelectedAspectRatios(freeRatios);
    toast.success('All free aspect ratios selected');
  };

  const selectAllRatios = () => {
    if (!isProUser && !debugAllowAllAspectRatios) {
      toast.error('Premium aspect ratios are available for Creator users only');
      return;
    }
    
    const allRatios = aspectRatios.map(ratio => ratio.id);
    setSelectedAspectRatios(allRatios);
    toast.success('All aspect ratios selected');
  };

  const clearSelection = () => {
    setSelectedAspectRatios(['1:1']); // Keep at least one selected
    toast.success('Selection cleared (keeping Square)');
  };

  if (!user) {
    return (
      <>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Start Creating Amazing Logos</h2>
            <p className="text-gray-600 mb-8">Sign in to begin generating your logos</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAuthModal(true)}
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Get Started
            </motion.button>
          </div>
        </div>
        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => setShowAuthModal(false)} 
        />
      </>
    );
  }

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-8"> 
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
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>
            </div>

            {/* Right Side: Action Button */}
            <div className="w-full sm:w-auto flex-shrink-0">
              {!isProUser ? (
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  // TODO: Add your logic to show the subscription modal
                  // onClick={() => setShowSubscriptionModal(true)} 
                  className="w-full sm:w-auto bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center justify-center space-x-2"
                >
                  <Crown className="h-5 w-5" />
                  <span>Upgrade Plan</span>
                </motion.button>
              ) : (
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  // TODO: Add your logic to show a subscription management page
                  // onClick={() => navigateToAccountPage()} 
                  className="w-full sm:w-auto bg-emerald-600 text-white font-semibold py-3 px-6 rounded-lg shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors flex items-center justify-center space-x-2"
                >
                   <PaymentButton
                    productId="prod_SUxt63tLx3WTzh"
                    className="w-full sm:w-auto bg-emerald-600 text-white hover:bg-emerald-700"
                  >
            
                  </PaymentButton> 
                </motion.button>
              )}
            </div>
          </div>
        </div>

          {/* Subscription Card for Free Users */}
          {!isProUser && <SubscriptionCard />}

          {/* Category Selection */}
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
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

          {/* Aspect Ratio Selection - Multiple Selection */}
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Select aspect ratios ({selectedAspectRatios.length} selected)
              </h3>
              <div className="flex items-center space-x-2">
                {!isProUser && !debugAllowAllAspectRatios && (
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Lock className="h-4 w-4" />
                    <span>Premium ratios require Pro</span>
                  </div>
                )}
                {debugAllowAllAspectRatios && (
                  <div className="flex items-center space-x-2 text-sm text-green-600 bg-green-50 px-2 py-1 rounded">
                    <span>🔓 Debug: All ratios unlocked</span>
                  </div>
                )}
              </div>
            </div>

            {/* Selection Controls */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={selectAllFreeRatios}
                className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg text-sm transition-colors"
              >
                Select All Free
              </button>
              {(isProUser || debugAllowAllAspectRatios) && (
                <button
                  onClick={selectAllRatios}
                  className="px-3 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-lg text-sm transition-colors"
                >
                  Select All
                </button>
              )}
              <button
                onClick={clearSelection}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm transition-colors"
              >
                Clear Selection
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {aspectRatios.map((ratio) => {
                const isAccessible = ratio.free || isProUser || debugAllowAllAspectRatios;
                const isSelected = selectedAspectRatios.includes(ratio.id);
                
                return (
                  <motion.button
                    key={ratio.id}
                    whileHover={{ scale: isAccessible ? 1.02 : 1 }}
                    whileTap={{ scale: isAccessible ? 0.98 : 1 }}
                    onClick={() => handleAspectRatioToggle(ratio.id)}
                    disabled={!isAccessible}
                    className={`p-4 rounded-xl text-left transition-all duration-200 relative ${
                      isSelected
                        ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg ring-2 ring-indigo-300'
                        : isAccessible
                        ? 'bg-white hover:bg-gray-50 border border-gray-200'
                        : 'bg-gray-100 border border-gray-200 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    {/* Selection indicator */}
                    <div className="absolute top-2 left-2">
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5 text-white" />
                      ) : (
                        <Square className="h-5 w-5 text-gray-400" />
                      )}
                    </div>

                    {/* Premium indicator */}
                    {!ratio.free && !isProUser && !debugAllowAllAspectRatios && (
                      <div className="absolute top-2 right-2">
                        <Lock className="h-4 w-4 text-gray-400" />
                      </div>
                    )}
                    
                    <div className="mt-6">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="font-semibold">{ratio.name}</h4>
                        {!ratio.free && (
                          <Crown className={`h-4 w-4 ${
                            isSelected 
                              ? 'text-yellow-300' 
                              : debugAllowAllAspectRatios 
                              ? 'text-green-500' 
                              : 'text-yellow-500'
                          }`} />
                        )}
                      </div>
                      <p className={`text-sm font-medium mb-1 ${
                        isSelected ? 'text-white/90' : 'text-gray-700'
                      }`}>
                        {ratio.ratio}
                      </p>
                      <p className={`text-xs ${
                        isSelected ? 'text-white/70' : 'text-gray-500'
                      }`}>
                        {ratio.description}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Selection Summary */}
            {selectedAspectRatios.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Selected ratios:</strong> {selectedAspectRatios.map(id => {
                    const ratio = aspectRatios.find(r => r.id === id);
                    return ratio?.name || id;
                  }).join(', ')}
                  {debugAllowAllAspectRatios && selectedAspectRatios.some(id => {
                    const ratio = aspectRatios.find(r => r.id === id);
                    return ratio && !ratio.free;
                  }) && (
                    <span className="ml-2 text-green-600 font-medium">🔓 Debug Unlocked</span>
                  )}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Each ratio will consume 1 credit • Total: {creditsNeeded} credit{creditsNeeded > 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>

          {/* Advanced Settings */}
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Generation Settings</h3>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Settings className="h-4 w-4" />
                <span className="text-sm">{showAdvancedSettings ? 'Hide' : 'Show'} Advanced</span>
              </motion.button>
            </div>

            <AnimatePresence>
              {showAdvancedSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-6"
                >
                  {/* Guidance Scale */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Guidance Scale - Controls how closely the image follows your prompt
                    </label>
                    <div className="flex items-center space-x-4">
                      <input
                        type="range"
                        min="1.0"
                        max="20.0"
                        step="0.1"
                        value={guidanceScale}
                        onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="w-16 px-2 py-1 bg-gray-100 rounded text-center text-sm font-medium">
                        {guidanceScale.toFixed(1)}
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>More creative</span>
                      <span>More precise</span>
                    </div>
                  </div>

                  {/* Inference Steps */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Inference Steps - Higher values produce more detailed images but take longer
                    </label>
                    <div className="flex items-center space-x-4">
                      <input
                        type="range"
                        min="1"
                        max="100"
                        step="1"
                        value={numInferenceSteps}
                        onChange={(e) => setNumInferenceSteps(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="w-16 px-2 py-1 bg-gray-100 rounded text-center text-sm font-medium">
                        {numInferenceSteps}
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>Faster</span>
                      <span>Higher quality</span>
                    </div>
                  </div>

                  {/* Seed */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Seed - Controls randomness (-1 for random seed)
                      </label>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={generateRandomSeed}
                        className="flex items-center space-x-1 px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded text-xs transition-colors"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Random</span>
                      </motion.button>
                    </div>
                    <div className="flex items-center space-x-4">
                      <input
                        type="range"
                        min="-1"
                        max="2147483647"
                        step="1"
                        value={seed}
                        onChange={(e) => setSeed(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <input
                        type="number"
                        min="-1"
                        max="2147483647"
                        value={seed}
                        onChange={(e) => setSeed(parseInt(e.target.value) || -1)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Use the same seed to reproduce similar results. Each aspect ratio will use seed + index.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Prompt Input */}
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
            <div className="flex items-center justify-between mb-3">
              <label htmlFor="prompt" className="block text-lg font-semibold text-gray-900">
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
              id="prompt"
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
                !canGenerateAll || 
                (userCredits && !userCredits.canGenerate)
              }
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>
                    Generating {generationProgress.current}/{generationProgress.total} logos...
                  </span>
                </>
              ) : userCredits && !userCredits.canGenerate ? (
                <>
                  <Lock className="h-5 w-5" />
                  <span>No Credits Available</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>
                    Generate {selectedAspectRatios.length} Logo {selectedAspectRatios.length > 1 ? 's' : ''} 
                    ({creditsNeeded} credit{creditsNeeded > 1 ? 's' : ''})
                  </span>
                </>
              )}
            </motion.button>
            
            {!canGenerateAll && (
              <p className="text-red-600 text-sm mt-2">
                You need {creditsNeeded} credits but only have {remainingCredits}
              </p>
            )}

            {userCredits && !userCredits.canGenerate && (
              <p className="text-red-600 text-sm mt-2">
                {userCredits.isProUser 
                  ? 'No credits remaining. Please upgrade your plan.' 
                  : 'Daily limit reached. Try again tomorrow or upgrade to Creator.'
                }
              </p>
            )}
          </div>

          {/* Generated Logos */}
          <AnimatePresence>
            {generatedLogos.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Your Generated Logos ({generatedLogos.length} variants)
                  </h3>
                  
                  {generatedLogos.length > 1 && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={downloadAllLogos}
                      className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download All</span>
                    </motion.button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {generatedLogos.map((logo, index) => (
                    <motion.div
                      key={logo.aspectRatio}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-white rounded-xl p-4 shadow-md"
                    >
                      <div className="text-center mb-3">
                        <div className="flex items-center justify-center space-x-2">
                          <h4 className="font-semibold text-gray-900">{logo.name}</h4>
                          {logo.storedUrl && (
                            <div className="flex items-center space-x-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                              <Cloud className="h-3 w-3" />
                              <span>HQ</span>
                            </div>
                          )}
                          {logo.isStoring && (
                            <div className="flex items-center space-x-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>Storing</span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{logo.ratio}</p>
                      </div>
                      
                      <div className="bg-gray-50 rounded-lg p-4 mb-4">
                        <img
                          id={`generated-logo-${logo.aspectRatio}`}
                          src={logo.storedUrl || logo.url}
                          alt={`Generated logo - ${logo.name}`}
                          className="max-w-full max-h-32 mx-auto rounded-lg shadow-sm"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex space-x-2">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => downloadLogo(logo, 'png')}
                            className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
                          >
                            <Download className="h-3 w-3" />
                            <span>PNG</span>
                            {logo.storedUrl && <span className="text-xs opacity-75">(HQ)</span>}
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => downloadLogo(logo, 'svg')}
                            className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                          >
                            <Download className="h-3 w-3" />
                            <span>SVG</span>
                          </motion.button>
                        </div>

                        {/* Background Removal Button */}
                        {isBgRemovalAvailable && (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleRemoveBackground(logo)}
                            className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 transition-colors text-sm"
                          >
                            <Scissors className="h-3 w-3" />
                            <span>Remove Background</span>
                          </motion.button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Video Creator Button for Pro Users */}
                {/* {isProUser && generatedLogos.length > 0 && (
                  <div className="mt-6 text-center">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowVideoCreator(!showVideoCreator)}
                      className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 transition-colors mx-auto"
                    >
                      <Video className="h-5 w-5" />
                      <span>Create Video with Logo</span>
                    </motion.button>
                  </div>
                )} */}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Video Creator */}
          <AnimatePresence>
            {showVideoCreator && generatedLogos.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Create Personalized Video</h3>
                  <Crown className="h-6 w-6 text-yellow-500" />
                </div>
                <VideoCreator logoUrl={generatedLogos[0]?.storedUrl || generatedLogos[0]?.url} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Background Removal Modal */}
      {selectedLogoForBgRemoval && (
        <BackgroundRemovalModal
          isOpen={showBackgroundRemovalModal}
          onClose={() => {
            setShowBackgroundRemovalModal(false);
            setSelectedLogoForBgRemoval(null);
          }}
          imageUrl={selectedLogoForBgRemoval.storedUrl || selectedLogoForBgRemoval.url}
          imageName={`${selectedLogoForBgRemoval.name}-${selectedLogoForBgRemoval.ratio}`}
        />
      )}

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </>
  );
};