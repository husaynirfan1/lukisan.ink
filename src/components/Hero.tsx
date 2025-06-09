import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Zap, Download, Video, Users, Megaphone } from 'lucide-react';
import { AnimatedTagline } from './AnimatedTagline';
import { GuestLogoGenerator } from './GuestLogoGenerator';
import { MediaGallery } from './MediaGallery';

export const Hero: React.FC = () => {
  return (
    <>
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        {/* Background decoration */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute top-40 right-10 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute -bottom-32 left-1/2 w-72 h-72 bg-cyan-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6">
                Create Stunning
               <span className="block bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent pb-4">
    AI-Powered Logos
  </span>
              </h1>
            </motion.div>

            {/* Animated Tagline with Scrolling Words */}
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
              className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed"
            >
              Transform your ideas into professional logos and personalized videos with cutting-edge AI technology. 
              Create stunning visuals and engaging content that elevates your brand in seconds.
            </motion.p>

            {/* Feature Grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12"
            >
              <div className="flex flex-col items-center space-y-3 p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 hover:bg-white/80 transition-all duration-300">
                <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900">AI Logo Generation</h3>
                <p className="text-sm text-gray-600 text-center">Professional logos created instantly</p>
              </div>

              <div className="flex flex-col items-center space-y-3 p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 hover:bg-white/80 transition-all duration-300">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
                  <Users className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900">Welcome Videos</h3>
                <p className="text-sm text-gray-600 text-center">Personalized onboarding content</p>
              </div>

              <div className="flex flex-col items-center space-y-3 p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 hover:bg-white/80 transition-all duration-300">
                <div className="p-3 bg-gradient-to-br from-pink-500 to-red-600 rounded-xl">
                  <Megaphone className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900">Marketing Snippets</h3>
                <p className="text-sm text-gray-600 text-center">Engaging promotional videos</p>
              </div>

              <div className="flex flex-col items-center space-y-3 p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 hover:bg-white/80 transition-all duration-300">
                <div className="p-3 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl">
                  <Download className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900">High-Quality Downloads</h3>
                <p className="text-sm text-gray-600 text-center">Multiple formats available</p>
              </div>
            </motion.div>

            {/* Enhanced Feature Highlights */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-wrap justify-center gap-8 text-sm text-gray-500 mb-16"
            >
              <div className="flex items-center space-x-2">
                <Zap className="h-5 w-5 text-indigo-500" />
                <span>Instant AI Generation</span>
              </div>
              <div className="flex items-center space-x-2">
                <Video className="h-5 w-5 text-purple-500" />
                <span>Personalized Videos</span>
              </div>
              <div className="flex items-center space-x-2">
                <Sparkles className="h-5 w-5 text-cyan-500" />
                <span>Professional Quality</span>
              </div>
            </motion.div>
          </div>

          {/* Try It Now Section */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-16"
          >
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Try It Now - No Sign Up Required
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Experience the power of AI logo generation instantly. Create your first logo and see the magic happen!
              </p>
            </div>

            {/* Guest Logo Generator */}
            <GuestLogoGenerator />
          </motion.div>
        </div>
      </div>

      {/* Media Gallery Section */}
      <MediaGallery />
    </>
  );
};