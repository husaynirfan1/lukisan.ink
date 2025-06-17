import React from 'react';
import { motion } from 'framer-motion';

// --- Placeholder Data ---
// In a real application, you would fetch these from a CMS or an API.
// Using placeholder image service for demonstration.
const logoUrls = [
   '/assets/images/gallery/sample-1.png',
  '/assets/images/gallery/sample-2.png',
  '/assets/images/gallery/sample-3.png',
  '/assets/images/gallery/sample-4.png',
  '/assets/images/gallery/sample-5.png',
  '/assets/images/gallery/sample-6.png',
];

// Using placeholder video URLs for demonstration.
const videoUrls = [
    '/assets/videos/gallery/sample-berger.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-abstract-video-of-a-man-with-head-down-3248-small.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-a-girl-in-a-leather-jacket-turning-her-head-3525-small.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-close-up-of-a-person-working-on-a-laptop-3485-small.mp4',
];

// --- Animation Variants ---
const marqueeVariants = {
  animate: {
    y: ['-100%', '0%'],
    transition: {
      y: {
        repeat: Infinity,
        repeatType: 'loop',
        duration: 30, // Slower duration for a smoother scroll
        ease: 'linear',
      },
    },
  },
};

const marqueeVariantsReverse = {
    animate: {
      y: ['0%', '-100%'],
      transition: {
        y: {
          repeat: Infinity,
          repeatType: 'loop',
          duration: 35, // Varied duration for a more dynamic feel
          ease: 'linear',
        },
      },
    },
  };


export const MediaShowcase: React.FC = () => {
  return (
    <>
      {/* Left Column: Logo Showcase */}
      <div className="absolute top-0 left-0 h-full w-1/4 lg:w-1/5 overflow-hidden pointer-events-none">
        <motion.div
          className="w-full h-full"
          variants={marqueeVariants}
          animate="animate"
        >
          {/* We need to duplicate the content to create a seamless loop */}
          <div className="flex flex-col items-center justify-around h-full gap-4 py-2">
            {[...logoUrls, ...logoUrls].map((url, index) => (
              <div key={`logo-${index}`} className="w-40 h-40 flex-shrink-0 bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-gray-200/50 p-4 flex items-center justify-center">
                <img src={url} alt={`Logo ${index + 1}`} className="max-w-full max-h-full object-contain" />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right Column: Video Showcase */}
      <div className="absolute top-0 right-0 h-full w-1/4 lg:w-1/5 overflow-hidden pointer-events-none">
        <motion.div
            className="w-full h-full"
            variants={marqueeVariantsReverse}
            animate="animate"
        >
          <div className="flex flex-col items-center justify-around h-full gap-4 py-2">
           {/* Duplicate videos for seamless looping */}
           {[...videoUrls, ...videoUrls].map((url, index) => (
             <div key={`video-${index}`} className="w-52 h-32 flex-shrink-0 bg-gray-900 rounded-2xl border-2 border-gray-700/80 overflow-hidden">
                <video
                  src={url}
                  autoPlay
                  loop
                  muted
                  playsInline // Essential for autoplay on mobile browsers
                  className="w-full h-full object-cover"
                />
             </div>
           ))}
          </div>
        </motion.div>
      </div>
    </>
  );
};
