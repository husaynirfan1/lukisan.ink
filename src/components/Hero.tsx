import React, { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Sparkles,
  Zap,
  Download,
  Video,
  Users,
  Megaphone,
  AlertTriangle,
} from 'lucide-react';

import { AnimatedTagline } from './AnimatedTagline';
import { GuestLogoGenerator } from './GuestLogoGenerator';
import { MediaShowcase } from './UpdatedMediaShowcase';
import { AuroraBackground } from './aurora-background';
import { AuthModal } from './auth/AuthModal';

export const Hero: React.FC = () => {
  const guestLogoGeneratorRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();

  const [showAuthModal, setShowAuthModal] = useState(false);

  const opacityRange = [0, 0.3];
  const mediaShowcaseOpacity = useTransform(scrollYProgress, opacityRange, [1, 0]);

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    console.log('Authentication successful!');
  };

  return (
    <>
      {/* Maintenance Banner */}
      <div className="bg-orange-500 text-white text-center p-2 flex items-center justify-center space-x-2">
        <AlertTriangle className="h-5 w-5" />
        <span className="font-medium">
          We're performing improvements for the best mobile experience. Stay tune!
        </span>
      </div>

      <AuroraBackground className="relative overflow-hidden">
        <motion.div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{ opacity: mediaShowcaseOpacity }}
        >
          <MediaShowcase />
        </motion.div>

        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6 }}
  className="relative" // Added relative positioning here
>
  <a 
    href="https://bolt.new/" 
    target="_blank" // Added target blank for external link
    rel="noopener noreferrer" // Security best practice
    className="absolute -top-8 left-1/2 transform -translate-x-1/2 -translate-y-full hover:scale-110 transition-transform"
  >
    <img 
      src="/bolt_black.svg" 
      alt="Bolt Icon" 
      className="h-12 w-12 sm:h-16 sm:w-16" 
      onError={(e) => {
        // Fallback in case image fails to load
        const target = e.target as HTMLImageElement;
        target.onerror = null;
        target.src = "/bolt.svg"; // Try alternative filename
      }}
    />
  </a>
              <h1 className="heading-primary text-gray-900 mb-6">
                Create Stunning
                <span className="block bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent pb-4">
                  AI-Powered Logos
                </span>
              </h1>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-8"
            >
              <AnimatedTagline />
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="body-large text-gray-600 mb-12 max-w-2xl mx-auto"
            >
              Your brand has a story to tell. We'll help you tell it with gorgeous logos and videos, crafted in seconds to connect with your audience.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowAuthModal(true)}
                className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                Get Started Free
              </motion.button>
            </motion.div>
          </div>

          {/* Feature Grid */}
          <div className="px-2 sm:px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 my-12"
            >
              <Feature
                icon={Sparkles}
                title="AI Logo Generation"
                text="Professional logos created instantly"
                gradient="from-indigo-500 to-purple-600"
              />
              <Feature
                icon={Users}
                title="Welcome Videos"
                text="Personalized onboarding content"
                gradient="from-purple-500 to-pink-600"
              />
              <Feature
                icon={Megaphone}
                title="Marketing Snippets"
                text="Engaging promotional videos"
                gradient="from-pink-500 to-red-600"
              />
              <Feature
                icon={Download}
                title="High-Quality Downloads"
                text="Multiple formats available"
                gradient="from-cyan-500 to-blue-600"
              />
            </motion.div>
          </div>

          {/* Try It Now Section */}
          <div ref={guestLogoGeneratorRef} className="mt-16">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="text-center mb-8"
            >
              <h2 className="heading-secondary text-gray-900 mb-4">
                Try It Now Free - No Sign Up Required
              </h2>
              <p className="body-large text-gray-600 max-w-2xl mx-auto">
                Experience the power of AI logo generation instantly. Create your first logo and see the magic happen!
              </p>
            </motion.div>

            <GuestLogoGenerator />
          </div>
        </div>
      </AuroraBackground>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        initialMode="signup"
      />
    </>
  );
};

const Feature = ({
  icon: Icon,
  title,
  text,
  gradient,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
  gradient: string;
}) => (
  <div className="flex flex-col items-center space-y-2 sm:space-y-3 p-4 sm:p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 hover:bg-white/80 transition-all duration-300">
    <div className={`p-2 sm:p-3 bg-gradient-to-br ${gradient} rounded-xl`}>
      <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
    </div>
    <h3 className="text-sm sm:text-base font-semibold text-gray-900 text-center">{title}</h3>
    <p className="text-xs sm:text-sm text-gray-600 text-center">{text}</p>
  </div>
);
