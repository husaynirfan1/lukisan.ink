// src/components/SupportButton.tsx
import React from 'react';
import { motion } from 'framer-motion';
// Changed the icon import from LifeBuoy to MessageSquare
import { MessageSquare } from 'lucide-react';

export const SupportButton: React.FC = () => {
  const handleSupportClick = () => {
    window.location.href = 'mailto:mhusaynirfan@lukisan.space';
  };

  return (
    <motion.button
      onClick={handleSupportClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-8 right-8 z-50 w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-colors duration-300"
      aria-label="Contact Support"
    >
      {/* Replaced the icon component */}
      <MessageSquare className="w-8 h-8" />
    </motion.button>
  );
};