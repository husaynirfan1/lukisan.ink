import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';

// A more seamless, vertically scrolling animated tagline
export const AnimatedTagline = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // An array of different video types and their corresponding colors for the animation
  const videoTypes = useMemo(
    () => [
      { text: 'welcoming videos', color: 'from-purple-600 to-pink-600' },
      { text: 'business videos', color: 'from-indigo-600 to-purple-600' },
      { text: 'marketing content', color: 'from-pink-600 to-red-600' },
      { text: 'brand stories', color: 'from-cyan-600 to-blue-600' },
    ],
    []
  );

  // This effect sets up an interval to change the displayed text every 3 seconds
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Loop back to the start of the array
      if (currentIndex === videoTypes.length - 1) {
        setCurrentIndex(0);
      } else {
        setCurrentIndex(currentIndex + 1);
      }
    }, 3000); // Change text every 3 seconds
    return () => clearTimeout(timeoutId);
  }, [currentIndex, videoTypes]);

  return (
    <div className="text-3xl md:text-4xl text-gray-700 text-center space-y-2">
      <span>Then, Elevate Your Brand with</span>
      {/* Container for the animated text, hiding overflow */}
      <div className="relative h-16 flex items-center justify-center overflow-hidden">
        {videoTypes.map((item, index) => (
          <motion.span
            key={index}
            className={`absolute font-bold bg-gradient-to-r ${item.color} bg-clip-text text-transparent`}
            // Initial animation state (off-screen)
            initial={{ opacity: 0, y: "100%" }}
            // Animate to this state when the index matches the current index
            animate={
              currentIndex === index
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: currentIndex > index ? "-100%" : "100%" }
            }
            transition={{ type: "spring", stiffness: 90, damping: 20 }}
          >
            Personalized {item.text}
          </motion.span>
        ))}
      </div>
    </div>
  );
};
