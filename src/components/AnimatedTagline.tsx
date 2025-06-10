import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const videoTypes = [
  { text: 'welcoming videos', color: 'from-purple-600 to-pink-600' },
  { text: 'business videos', color: 'from-indigo-600 to-purple-600' },
  { text: 'marketing content', color: 'from-pink-600 to-red-600' },
  { text: 'brand stories', color: 'from-cyan-600 to-blue-600' },
];

export const AnimatedTagline: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % videoTypes.length);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="heading-secondary text-gray-700 leading-tight my-8 mb-12">
      <div className="flex flex-col items-center space-y-2">
        <span className="mb-4">Then, Elevate Your Brand with</span>
        <div className="relative h-16 md:h-18 lg:h-20 flex items-center justify-center min-w-[300px] md:min-w-[400px] mt-4 overflow-visible">
          <AnimatePresence mode="wait">
            <motion.span
              key={currentIndex}
              initial={{ 
                y: 60, 
                opacity: 0,
                rotateX: -90,
                scale: 0.8
              }}
              animate={{ 
                y: 0, 
                opacity: 1,
                rotateX: 0,
                scale: 1
              }}
              exit={{ 
                y: -60, 
                opacity: 0,
                rotateX: 90,
                scale: 0.8
              }}
              transition={{ 
                duration: 0.6,
                ease: [0.4, 0.0, 0.2, 1],
                type: "spring",
                stiffness: 100,
                damping: 15
              }}
              className={`absolute font-bold bg-gradient-to-r ${videoTypes[currentIndex].color} bg-clip-text text-transparent leading-none`}
              style={{
                textShadow: '0 0 20px rgba(139, 92, 246, 0.3)',
                paddingBottom: '4px', // Add padding to prevent cutoff
              }}
            >
              Personalized {videoTypes[currentIndex].text}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};