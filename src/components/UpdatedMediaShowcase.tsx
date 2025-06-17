// src/components/MediaShowcase.tsx

import React from 'react';
import { motion } from 'framer-motion';
import { PlayCircle } from 'lucide-react';

// --- Placeholder Data ---
// In a real application, you would fetch these from a CMS or an API.
const logoUrls = [
  '/assets/images/gallery/sample-1.png',
  '/assets/images/gallery/sample-2.png',
  '/assets/images/gallery/sample-3.png',
  '/assets/images/gallery/sample-4png',
  '/assets/images/gallery/sample-5.png',
  '/assets/images/gallery/sample-6.png',
];

const videoThumbnails = [
  '/assets/videos/gallery/sample-berger.mp4',
  '/assets/videos/gallery/sample-berger.mp4',
 '/assets/videos/gallery/sample-berger.mp4',
  '/assets/videos/gallery/sample-berger.mp4',
];

// --- Animation Variants ---
const marqueeVariants = {
  animate: {
    y: ['-100%', '0%'],
    transition: {
      y: {
        repeat: Infinity,
        repeatType: 'loop',
        duration: 20, // Adjust duration for speed
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
          duration: 25, // Adjust duration for speed
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
              <div key={`logo-${index}`} className="w-40 h-40 flex-shrink-0 bg-white/80 backdrop-blur-sm rounded-2xl border-2 p-4 flex items-center justify-center">
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
           {[...videoThumbnails, ...videoThumbnails].map((url, index) => (
             <div key={`video-${index}`} className="w-52 h-32 flex-shrink-0 bg-gray-900 rounded-2xl border-2 border-gray-700/80 p-1 flex items-center justify-center relative overflow-hidden">
                <img src={url} alt={`Video thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <PlayCircle className="w-10 h-10 text-white/70" />
                </div>
             </div>
           ))}
          </div>
        </motion.div>
      </div>
    </>
  );
};