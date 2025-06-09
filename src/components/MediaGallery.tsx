import React, { useState, useRef, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, ExternalLink, Maximize2 } from 'lucide-react';

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  src: string;
  thumbnail?: string;
  title: string;
  description: string;
  aspectRatio: string;
}

const mediaItems: MediaItem[] = [
  {
    id: 'company-logo',
    type: 'image',
    src: '/assets/images/gallery/company-logo.png',
    title: 'Lukisan Brand Identity',
    description: 'Our signature logo representing innovation in AI-powered design',
    aspectRatio: '2:1'
  },
  {
    id: 'demo-video-1',
    type: 'video',
    src: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
    thumbnail: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800&h=450&fit=crop',
    title: 'AI Logo Generation Demo',
    description: 'Watch how our AI creates stunning logos in seconds',
    aspectRatio: '16:9'
  },
  {
    id: 'demo-video-2',
    type: 'video',
    src: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_2mb.mp4',
    thumbnail: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=800&h=450&fit=crop',
    title: 'Personalized Video Creation',
    description: 'See how we transform logos into engaging video content',
    aspectRatio: '16:9'
  },
  {
    id: 'demo-video-3',
    type: 'video',
    src: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_5mb.mp4',
    thumbnail: 'https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?auto=compress&cs=tinysrgb&w=800&h=450&fit=crop',
    title: 'Brand Success Stories',
    description: 'Real businesses transformed with our AI-powered solutions',
    aspectRatio: '16:9'
  },
  {
    id: 'showcase-image',
    type: 'image',
    src: 'https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    title: 'Creative Showcase',
    description: 'A collection of our finest AI-generated designs',
    aspectRatio: '4:3'
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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isHovered && !isPlaying) {
      video.currentTime = 0;
      video.play().catch(console.error);
      setIsPlaying(true);
    } else if (!isHovered && isPlaying) {
      video.pause();
      setIsPlaying(false);
    }
  }, [isHovered, isPlaying]);

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
      className="relative w-full h-full overflow-hidden"
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

      {/* Video Controls Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showControls ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/20 flex items-center justify-center"
      >
        <div className="flex items-center space-x-3">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={togglePlay}
            className="p-3 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-white transition-colors"
            aria-label={isPlaying ? 'Pause video' : 'Play video'}
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 text-gray-900" />
            ) : (
              <Play className="h-6 w-6 text-gray-900 ml-1" />
            )}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={toggleMute}
            className="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-white transition-colors"
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
      {!showControls && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="p-4 bg-white/10 backdrop-blur-sm rounded-full">
            <Play className="h-8 w-8 text-white ml-1" />
          </div>
        </div>
      )}
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
                  <div className="text-gray-500">Loading...</div>
                </div>
              )}
              <img
                src={item.src}
                alt={item.title}
                className={`w-full h-full transition-all duration-500 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                } ${item.type === 'logo' ? 'object-contain p-8 bg-white' : 'object-cover'}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
                loading="lazy"
              />
            </div>
          )}
        </motion.div>

        {/* Content Overlay */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ 
            opacity: isHovered ? 1 : 0, 
            y: isHovered ? 0 : 30 
          }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-6"
        >
          {/* ... inner content of overlay ... */}
          <div className="text-white">
            <motion.h3 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: isHovered ? 0 : 20, opacity: isHovered ? 1 : 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="text-xl md:text-2xl font-bold mb-3"
            >
              {item.title}
            </motion.h3>
            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: isHovered ? 0 : 20, opacity: isHovered ? 1 : 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="text-white/90 text-sm md:text-base leading-relaxed mb-4"
            >
              {item.description}
            </motion.p>
          </div>
          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: isHovered ? 0 : 20, opacity: isHovered ? 1 : 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="self-start flex items-center space-x-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-xl hover:bg-white/30 transition-all duration-200 border border-white/20"
            aria-label={`View ${item.title}`}
          >
            {item.type === 'video' ? <Play className="h-4 w-4" /> : item.type === 'logo' ? <Sparkles className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="text-sm font-medium">
              {item.type === 'video' ? 'Watch Demo' : item.type === 'logo' ? 'Our Brand' : 'View Gallery'}
            </span>
          </motion.button>
        </motion.div>

        {/* Media Type Badge */}
        <div className="absolute top-4 right-4 z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className={`px-3 py-1 backdrop-blur-sm rounded-full text-xs font-semibold border ${
              item.type === 'video' 
                ? 'bg-red-500/20 text-red-100 border-red-400/30' 
                : item.type === 'logo'
                ? 'bg-indigo-500/20 text-indigo-100 border-indigo-400/30'
                : 'bg-purple-500/20 text-purple-100 border-purple-400/30'
            }`}
          >
            {item.type === 'video' ? '🎥 Video' : item.type === 'logo' ? '✨ Brand' : '🎨 Gallery'}
          </motion.div>
        </div>

        {/* Featured Badge */}
        {item.featured && (
          <div className="absolute top-4 left-4 z-10">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 + 0.2 }}
              className="px-3 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-full text-xs font-bold shadow-lg"
            >
              ⭐ Featured
            </motion.div>
          </div>
        )}

        {/* Hover Glow Effect */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-cyan-500/20 pointer-events-none"
        />
      </div>
    </motion.div>
  );
};
export const MediaGallery: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-200px" });

  return (
    <section 
      ref={sectionRef}
      className="py-24 bg-gradient-to-br from-gray-50 to-white relative overflow-hidden"
      aria-labelledby="media-gallery-title"
    >
      {/* Background Decoration */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 
            id="media-gallery-title"
            className="text-4xl md:text-5xl font-bold text-gray-900 mb-6"
          >
            Experience Our
            <span className="block bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
              Creative Innovation
            </span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Discover how our AI-powered platform transforms ideas into stunning visual content. 
            From logos to personalized videos, see the future of creative design in action.
          </p>
        </motion.div>

        {/* Media Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {mediaItems.map((item, index) => (
            <MediaCard
              key={item.id}
              item={item}
              index={index}
            />
          ))}
        </div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-center mt-16"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            <span>Start Creating Today</span>
            <ExternalLink className="h-5 w-5" />
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
};