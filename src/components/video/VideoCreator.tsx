import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Play, Download, Loader2, Crown, Users, Megaphone } from 'lucide-react';
import { generatePersonalizedVideo, VideoGenerationRequest, VideoGenerationResponse } from '../../lib/tavus';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface VideoCreatorProps {
  logoUrl?: string;
  onVideoGenerated?: (video: VideoGenerationResponse) => void;
}

export const VideoCreator: React.FC<VideoCreatorProps> = ({ logoUrl, onVideoGenerated }) => {
  const { user, canGenerate, refetchUser, getUserTier } = useAuth();
  const [activeTab, setActiveTab] = useState<'welcome' | 'marketing'>('welcome');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<VideoGenerationResponse | null>(null);
  const [formData, setFormData] = useState({
    message: '',
    recipientName: '',
    companyName: '',
    duration: 30,
  });

  const userTier = getUserTier();
  const isProUser = userTier === 'pro';

  const handleGenerate = async () => {
    if (!user || !isProUser) {
      toast.error('Video creation is available for Creator users only');
      return;
    }

    if (!canGenerate()) {
      toast.error('No credits remaining');
      return;
    }

    if (!formData.message.trim()) {
      toast.error('Please enter a message for your video');
      return;
    }

    setIsGenerating(true);

    try {
      const request: VideoGenerationRequest = {
        type: activeTab,
        message: formData.message,
        logoUrl,
        recipientName: formData.recipientName,
        companyName: formData.companyName,
        duration: formData.duration,
      };

      const video = await generatePersonalizedVideo(request);

      // Save video generation to database
      const { error: dbError } = await supabase
        .from('video_generations')
        .insert({
          user_id: user.id,
          video_type: activeTab,
          message: formData.message,
          recipient_name: formData.recipientName,
          company_name: formData.companyName,
          video_id: video.video_id,
          video_url: video.video_url,
          logo_url: logoUrl,
        });

      if (dbError) {
        console.error('Database error:', dbError);
      }

      // Update user credits
      const { error: updateError } = await supabase
        .from('users')
        .update({
          credits_remaining: Math.max(0, user.credits_remaining - 1),
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Update error:', updateError);
      }

      setGeneratedVideo(video);
      refetchUser();
      onVideoGenerated?.(video);
      toast.success('Video generated successfully!');

    } catch (error) {
      toast.error('Failed to generate video. Please try again.');
      console.error('Video generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadVideo = async () => {
    if (!generatedVideo?.video_url) return;

    try {
      const link = document.createElement('a');
      link.href = generatedVideo.video_url;
      link.download = `${activeTab}-video-${Date.now()}.mp4`;
      link.target = '_blank';
      link.click();
      toast.success('Video download started!');
    } catch (error) {
      toast.error('Failed to download video');
      console.error('Download error:', error);
    }
  };

  if (!isProUser) {
    return (
      <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl p-6 border border-yellow-200/50">
        <div className="text-center">
          <Crown className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Pro Feature</h3>
          <p className="text-gray-600 mb-4">
            Video creation is available for Creator users. Upgrade to create personalized welcome videos and marketing snippets.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('welcome')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md transition-all duration-200 ${
            activeTab === 'welcome'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Welcome Video</span>
        </button>
        <button
          onClick={() => setActiveTab('marketing')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md transition-all duration-200 ${
            activeTab === 'marketing'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Megaphone className="h-4 w-4" />
          <span>Marketing Snippet</span>
        </button>
      </div>

      {/* Form */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {activeTab === 'welcome' ? 'Welcome Message' : 'Marketing Message'}
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder={
                activeTab === 'welcome'
                  ? 'e.g., We are excited to have you join our team! Your expertise will help us achieve great things together.'
                  : 'e.g., Transform your business with our innovative solutions. Join thousands of satisfied customers today!'
              }
              className="w-full h-24 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {activeTab === 'welcome' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipient Name
                </label>
                <input
                  type="text"
                  value={formData.recipientName}
                  onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                  placeholder="e.g., John Smith"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  placeholder="e.g., Your Company"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Video Duration
            </label>
            <select
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>1 minute</option>
            </select>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <div className="text-center">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleGenerate}
          disabled={isGenerating || !canGenerate()}
          className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Generating Video...</span>
            </>
          ) : (
            <>
              <Video className="h-5 w-5" />
              <span>Generate Video</span>
            </>
          )}
        </motion.button>
      </div>

      {/* Generated Video */}
      <AnimatePresence>
        {generatedVideo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Generated Video</h3>
            <div className="bg-black rounded-xl overflow-hidden">
              <video
                src={generatedVideo.video_url}
                poster={generatedVideo.thumbnail_url}
                controls
                className="w-full h-64 object-cover"
              >
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="flex justify-center space-x-4 mt-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={downloadVideo}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Download Video</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};