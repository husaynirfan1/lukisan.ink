 import React, { useRef } from 'react';

import { motion, useScroll, useTransform } from 'framer-motion';

import { Sparkles, Zap, Download, Video, Users, Megaphone, AlertTriangle } from 'lucide-react';

import { AnimatedTagline } from './AnimatedTagline';

import { GuestLogoGenerator } from './GuestLogoGenerator';

import { MediaShowcase } from './UpdatedMediaShowcase';



export const Hero: React.FC = () => {

const guestLogoGeneratorRef = useRef<HTMLDivElement>(null);

const { scrollYProgress } = useScroll();



// Define the scroll range where the fade-out should happen

// We'll calculate the start position based on the GuestLogoGenerator's offset

const opacityRange = [0, 0.3]; // Start fading when the top of the Hero is at 0% and fully faded by 30% of the viewport height



const mediaShowcaseOpacity = useTransform(scrollYProgress, opacityRange, [1, 0]);



return (
 
<>

{/* Maintenance Banner */}

<div className="bg-orange-500 text-white text-center p-2 flex items-center justify-center space-x-2">

<AlertTriangle className="h-5 w-5" />

<span className="font-medium">We're performing improvements on our video services. Video generation is unaffected, but you may experience minor issues.</span>

</div>

<AuroraBackground>
      <motion.div
        initial={{ opacity: 0.0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.3,
          duration: 0.8,
          ease: "easeInOut",
        }}
        className="relative flex flex-col gap-4 items-center justify-center px-4"
      >

  <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-purple-50">

    {/* Background decoration */}

    <div className="absolute inset-0">

      <div className="absolute -top-20 -left-20 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-2xl opacity-20 animate-pulse"></div>

      <div className="absolute top-40 -right-20 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-2xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="absolute -bottom-32 left-1/2 w-72 h-72 bg-cyan-300 rounded-full mix-blend-multiply filter blur-2xl opacity-20 animate-pulse" style={{ animationDelay: '4s' }}></div>

    </div>



    {/* Media Showcase with dynamic opacity */}

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

        >

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

      </div>



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

          <h3 className="heading-quaternary text-gray-900">AI Logo Generation</h3>

          <p className="body-small text-gray-600 text-center">Professional logos created instantly</p>

        </div>



        <div className="flex flex-col items-center space-y-3 p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 hover:bg-white/80 transition-all duration-300">

          <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">

            <Users className="h-6 w-6 text-white" />

          </div>

          <h3 className="heading-quaternary text-gray-900">Welcome Videos</h3>

          <p className="body-small text-gray-600 text-center">Personalized onboarding content</p>

        </div>



        <div className="flex flex-col items-center space-y-3 p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 hover:bg-white/80 transition-all duration-300">

          <div className="p-3 bg-gradient-to-br from-pink-500 to-red-600 rounded-xl">

            <Megaphone className="h-6 w-6 text-white" />

          </div>

          <h3 className="heading-quaternary text-gray-900">Marketing Snippets</h3>

          <p className="body-small text-gray-600 text-center">Engaging promotional videos</p>

        </div>



        <div className="flex flex-col items-center space-y-3 p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 hover:bg-white/80 transition-all duration-300">

          <div className="p-3 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl">

            <Download className="h-6 w-6 text-white" />

          </div>

          <h3 className="heading-quaternary text-gray-900">High-Quality Downloads</h3>

          <p className="body-small text-gray-600 text-center">Multiple formats available</p>

        </div>

      </motion.div>



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



        {/* Guest Logo Generator */}

        <GuestLogoGenerator />

      </div>
</motion.div>
    </AuroraBackground>
    </div>

  </div>

</>

);

};