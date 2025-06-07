import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const words = [
  'Branding',
  'Marketing', 
  'Engagement',
  'Connection',
  'Growth',
  'Innovation',
  'Success',
  'Impact'
];

export const ScrollingWords: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % words.length);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center h-16 overflow-hidden">
      <span className="text-xl md:text-2xl text-gray-600 mr-3">Elevate your</span>
      <div className="relative w-40 h-12 flex items-center">
        <AnimatePresence mode="wait">
          <motion.span
            key={currentIndex}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={{ 
              duration: 0.5,
              ease: [0.4, 0.0, 0.2, 1]
            }}
            className="absolute text-xl md:text-2xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent"
          >
            {words[currentIndex]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
};