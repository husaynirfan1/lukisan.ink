import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, Maximize2, ExternalLink, Sparkles } from 'lucide-react';
import { AuthModal } from './auth/AuthModal';
import { useAuth } from '../hooks/useAuth';

interface MediaItem {
  id: string;
  type: 'logo' | 'video' | 'image';
  src: string;
  thumbnail?: string;
  title: string;
  description: string;
  aspectRatio: string;
  featured?: boolean;
}

const showcaseItems: MediaItem[] = [
  {
    id: 'lukisan-logo',
    type: 'logo',
    src: '/assets/images/gallery/lukisan-logo.png',
    title: 'Lukisan Brand Identity',
    description: 'Our banner logo representing innovation in AI-powered creative solutions.',
    aspectRatio: '2:1',
    featured: true

  },
   {
    id: 'brand-showcase-1',
    type: 'video',
    src: '/assets/videos/gallery/sample-berger.mp4',
    title: 'BERGER Malaysia',
    description: 'A local burger stall, "BERGER" showcasing burger.',
    aspectRatio: '2:1',
     featured: true
  },
   {
    id: 'brand-showcase-1',
    type: 'video',
    src: '/assets/videos/gallery/sample-johndoe.mp4',
    title: 'Corporate Intro',
    description: 'Modern, clean and simple with corporate feels.',
    aspectRatio: '2:1',
     featured: true
  },
 {
    id: 'brand-showcase-1',
    type: 'video',
    src: '/assets/videos/gallery/sample-splash.mp4',
    title: 'Brand Splash',
    description: 'Chaotic splash brand video.',
    aspectRatio: '2:1',
     featured: true
  },
   {
    id: 'brand-showcase-1',
    type: 'video',
    src: '/assets/videos/gallery/sample-tech.mp4',
    title: 'Technology',
    description: 'Techy-feels videos introducing a product.',
    aspectRatio: '2:1',
  },
  {
    id: 'brand-showcase-2',
    type: 'logo',
    src: '/assets/images/gallery/sample-2.png',
    title: 'Chicken Rice Shop',
    description: 'Mixed abstract design of a chicken rice shop.',
    aspectRatio: '1:1'
  },
  {
    id: 'brand-showcase-2',
    type: 'logo',
    src: '/assets/images/gallery/sample-4.png',
    title: 'Company Logo',
    description: 'Tech company with futuristic looks.',
    aspectRatio: '1:1'
  },
  {
    id: 'brand-showcase-3',
    type: 'logo',
    src: '/assets/images/gallery/sample-3.png',
    title: 'Creative Industries',
    description: 'Artistic and innovative logos for creative professionals.',
    aspectRatio: '1:1'
  }
];

interface VideoPlayerProps {
  item: MediaItem;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ item, isHovered, onHover }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
  const video = videoRef.current;
  if (!video) return;

  const handleLoadedData = () => setIsLoaded(true);
  video.addEventListener('loadeddata', handleLoadedData);

  // Play the video automatically once it's loaded
  if (!isPlaying && isLoaded) {
    video.play().catch(console.error);
    setIsPlaying(true);
  }

  return () => {
    video.removeEventListener('loadeddata', handleLoadedData);
  };
}, [isPlaying, isLoaded]); // <-- Removed 'isHovered' from dependencies

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  return (
    <div 
      className="relative w-full h-full overflow-hidden bg-gray-900"
      onMouseEnter={() => {
        onHover(true);
        setShowControls(true);
      }}
      onMouseLeave={() => {
        onHover(false);
        setShowControls(false);
      }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        muted={isMuted}
        loop
        playsInline
        poster={item.thumbnail}
        preload="metadata"
        aria-label={item.title}
      >
        <source src={item.src} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Loading State */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center">
          <div className="caption-text text-gray-500">Loading video...</div>
        </div>
      )}

      {/* Video Controls Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showControls ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-center justify-center"
      >
        <div className="flex items-center space-x-4">
          

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={toggleMute}
            className="p-3 bg-white/80 backdrop-blur-sm rounded-full shadow-lg hover:bg-white/90 transition-all duration-200"
            aria-label={isMuted ? 'Unmute video' : 'Mute video'}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-gray-900" />
            ) : (
              <Volume2 className="h-4 w-4 text-gray-900" />
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Play indicator when not hovered */}
     
    </div>
  );
};

interface MediaCardProps {
  item: MediaItem;
  index: number;
}

const MediaCard: React.FC<MediaCardProps> = ({ item, index }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(cardRef, { once: true, margin: "-100px" });

  const getGridSpan = () => {
    if (item.featured) {
      if (item.type === 'logo') return 'md:col-span-2 lg:col-span-2';
      if (item.type === 'video') return 'md:col-span-2 lg:col-span-2';
    }
    return 'md:col-span-1';
  };

  const getCardHeight = () => {
    if (item.featured && item.type === 'logo') return 'h-64 md:h-80';
    if (item.featured && item.type === 'video') return 'h-64 md:h-80';
    return 'h-64';
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 60, scale: 0.9 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 60, scale: 0.9 }}
      transition={{ 
        duration: 0.7, 
        delay: index * 0.15,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      className={`group relative ${getGridSpan()}`}
    >
      <div
        className={`relative ${getCardHeight()} bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl overflow-hidden shadow-lg transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-indigo-500/20`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Media Content */}
        <motion.div
          animate={{ 
            scale: isHovered ? 1.05 : 1,
            filter: isHovered ? 'brightness(1.1)' : 'brightness(1)'
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full h-full relative"
        >
          {item.type === 'video' ? (
            <VideoPlayer
              item={item}
              isHovered={isHovered}
              onHover={setIsHovered}
            />
          ) : (
            <div className="relative w-full h-full">
              {!imageLoaded && (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse rounded-2xl flex items-center justify-center">
                  <div className="caption-text text-gray-500">Loading...</div>
                </div>
              )}
              <img
                src={item.src}
                alt={item.title}
                className={`w-full h-full transition-all duration-500 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                } ${item.type === 'logo' ? 'object-cover bg-white' : 'object-cover'}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
                loading="lazy"
              />
            </div>
          )}
        </motion.div>

        {/* Content Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6"
        >
          <div className="text-white">
            <h3 className="heading-quaternary text-white mb-2">{item.title}</h3>
            <p className="body-small text-white/90">{item.description}</p>
          </div>
        </motion.div>

        {/* Type Badge */}
        <div className="absolute top-4 left-4">
          <span className="px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full ui-text-small text-gray-800 capitalize">
            {item.type}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export const MediaShowcase: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-150px" });
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleStartCreating = () => {
    if (user) {
      // User is already signed in, redirect to dashboard
      window.location.href = '/dashboard';
    } else {
      // User is not signed in, show auth modal
      setShowAuthModal(true);
    }
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    // Redirect to dashboard after successful sign in
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 100);
  };

  return (
    <>
      <section 
        ref={sectionRef}
        className="py-24 bg-gradient-to-br from-slate-50 via-white to-indigo-50 relative overflow-hidden"
        aria-labelledby="media-showcase-title"
      >
        {/* Enhanced Background Decoration */}
        <div className="absolute inset-0 opacity-40">
          <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-r from-indigo-300 to-purple-300 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-r from-cyan-300 to-blue-300 rounded-full mix-blend-multiply filter blur-xl animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-pink-300 to-rose-300 rounded-full mix-blend-multiply filter blur-xl animate-pulse" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center mb-20"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={isInView ? { scale: 1, opacity: 1 } : { scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full ui-text-small font-medium mb-6"
            >
              <Sparkles className="h-4 w-4" />
              <span>Creative Showcase</span>
            </motion.div>

            <h2 
              id="media-showcase-title"
              className="heading-primary text-gray-900 mb-8"
            >
              Accelerate development.
              <span className="block bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent leading-tight pb-1">
                We Design, You Innovate.
              </span>
            </h2>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="body-large text-gray-600 max-w-4xl mx-auto"
            >
              Discover how our AI platform effortlessly transforms your ideas into professional logos, engaging videos, and stunning visual content, allowing your team to bypass design delays and focus on core innovation.
            </motion.div>
          </motion.div>

          {/* Media Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8 mb-16">
            {showcaseItems.map((item, index) => (
              <MediaCard
                key={item.id}
                item={item}
                index={index}
              />
            ))}
          </div>

          {/* Call to Action */}
        
        </div>
      </section>
      
      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
};