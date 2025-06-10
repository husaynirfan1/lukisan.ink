import React from 'react';
import { motion } from 'framer-motion';
import { 
  Package, 
  Zap, 
  PlayCircle, 
  Heart, 
  MessageSquare,
  Sparkles
} from 'lucide-react';

export interface VideoPreset {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  prompt: string;
  duration: number;
  category: 'product' | 'marketing' | 'explainer' | 'brand' | 'testimonial';
}

export const videoPresets: VideoPreset[] = [
  {
    id: 'modern-product-showcase',
    title: 'Modern Product Showcase',
    description: 'Clean, dynamic, and focused on the product\'s design and features',
    icon: Package,
    category: 'product',
    duration: 30,
    prompt: 'A minimalist and modern 30-second product showcase video for [Your Product Name]. Use slow, sweeping camera movements and close-up shots to highlight key features. The background should be a solid, neutral color with professional studio lighting that creates subtle shadows and highlights. Include clean, sans-serif text overlays to list 3 main benefits with smooth fade-in animations. The camera work includes 360-degree product rotation, macro detail shots, and elegant transitions. The overall aesthetic is premium and sophisticated with a contemporary feel. The soundtrack is an upbeat, royalty-free electronic or lofi hip-hop track that complements the visual rhythm.'
  },
  {
    id: 'high-energy-teaser',
    title: 'High-Energy Teaser',
    description: 'Fast-paced and exciting, perfect for a new launch or event',
    icon: Zap,
    category: 'marketing',
    duration: 15,
    prompt: 'A high-energy, 15-second teaser video with explosive visual impact. Use rapid cuts every 1-2 seconds, energetic transitions including whip pans, glitch effects, and dynamic zoom-ins. The mood is exciting and mysterious with a sense of urgency. The color palette features bold and vibrant neon colors with high contrast. Include kinetic typography with text that scales, rotates, and pulses with the beat. Add particle effects and light flares for extra visual punch. End with a strong call-to-action and the dramatic reveal of [Your Product/Event Name] with a powerful logo animation. Music is a driving electronic track with heavy bass drops and a strong 120+ BPM beat.'
  },
  {
    id: 'animated-explainer',
    title: 'Animated Explainer Video',
    description: 'Friendly and informative, using 2D animation to explain a service or concept',
    icon: PlayCircle,
    category: 'explainer',
    duration: 60,
    prompt: 'A 60-second animated explainer video in a clean, 2D vector illustration style. The video explains how [Your Service/Concept] works in three clear, sequential steps with smooth transitions between each section. Use friendly character animations with expressive faces and gestures, engaging iconography that supports the narrative, and infographic-style elements. The animation style is flat design with subtle depth through shadows and gradients. Include animated charts, progress bars, and visual metaphors that make complex concepts easy to understand. The color scheme should be bright and approachable with your brand colors as accents. A clear, professional voiceover narrates the script with perfect timing to match the animations. Background music is light, optimistic, and instrumental with a modern corporate feel.'
  },
  {
    id: 'cinematic-brand-story',
    title: 'Cinematic Brand Story',
    description: 'Emotional and narrative-driven, telling the story behind your brand',
    icon: Heart,
    category: 'brand',
    duration: 60,
    prompt: 'A cinematic, 60-second brand story video with emotional depth and authentic storytelling. The visual style is heartfelt and genuine, using soft, natural lighting with a warm color grade that evokes feelings of trust and connection. Show carefully composed scenes of real moments: the founder working passionately, the team collaborating and laughing, customers genuinely enjoying the product, and behind-the-scenes glimpses of your company culture. Use slow-motion shots strategically to create emotional impact and allow viewers to connect with the human elements. Include beautiful establishing shots and intimate close-ups that tell a complete narrative arc. The cinematography features smooth camera movements, shallow depth of field, and cinematic framing. The video is accompanied by an inspiring piano score that builds emotionally throughout, paired with a genuine, narrative voiceover that feels conversational and authentic.'
  },
  {
    id: 'customer-testimonial',
    title: 'Customer Testimonial',
    description: 'Authentic and trustworthy, featuring a satisfied customer\'s experience',
    icon: MessageSquare,
    category: 'testimonial',
    duration: 45,
    prompt: 'A 45-second customer testimonial video with a clean, professional, and trustworthy aesthetic. The main shot is a medium close-up of a genuine customer speaking directly to the camera in a well-lit, natural environment like a modern office, cozy home, or relevant workplace setting. Use professional three-point lighting to ensure the subject is perfectly lit with soft, flattering illumination. Intersperse carefully selected B-roll footage showing the customer authentically using [Your Product Name] in their daily routine, demonstrating real value and satisfaction. Include smooth transitions between talking head shots and B-roll sequences. Display the customer\'s name, title, and company with a clean, animated lower-third graphic that matches your brand style. The audio is crystal clear with professional microphone quality and subtle background music that doesn\'t compete with the testimonial. The overall tone is genuine, relatable, and builds trust through authentic storytelling.'
  }
];

interface VideoPresetsProps {
  onPresetSelect: (preset: VideoPreset) => void;
  selectedPresetId?: string;
}

export const VideoPresets: React.FC<VideoPresetsProps> = ({ 
  onPresetSelect, 
  selectedPresetId 
}) => {
  return (
    <div className="mb-6">
      <div className="flex items-center space-x-2 mb-4">
        <Sparkles className="h-5 w-5 text-indigo-600" />
        <h3 className="text-lg font-semibold text-gray-900">Video Presets</h3>
        <span className="text-sm text-gray-500">Choose a template to get started</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {videoPresets.map((preset, index) => {
          const IconComponent = preset.icon;
          const isSelected = selectedPresetId === preset.id;
          
          return (
            <motion.button
              key={preset.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onPresetSelect(preset)}
              className={`relative p-4 rounded-xl text-left transition-all duration-200 border-2 ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 shadow-lg'
                  : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'
              }`}
            >
              {/* Category Badge */}
              <div className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium ${
                preset.category === 'product' ? 'bg-blue-100 text-blue-700' :
                preset.category === 'marketing' ? 'bg-red-100 text-red-700' :
                preset.category === 'explainer' ? 'bg-green-100 text-green-700' :
                preset.category === 'brand' ? 'bg-purple-100 text-purple-700' :
                'bg-orange-100 text-orange-700'
              }`}>
                {preset.duration}s
              </div>

              {/* Icon */}
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                isSelected 
                  ? 'bg-indigo-100' 
                  : 'bg-gray-100'
              }`}>
                <IconComponent className={`h-6 w-6 ${
                  isSelected ? 'text-indigo-600' : 'text-gray-600'
                }`} />
              </div>

              {/* Content */}
              <h4 className={`font-semibold mb-2 text-sm leading-tight ${
                isSelected ? 'text-indigo-900' : 'text-gray-900'
              }`}>
                {preset.title}
              </h4>
              
              <p className={`text-xs leading-relaxed ${
                isSelected ? 'text-indigo-700' : 'text-gray-600'
              }`}>
                {preset.description}
              </p>

              {/* Selection Indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center"
                >
                  <span className="text-white text-xs">✓</span>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Preset Info */}
      {selectedPresetId && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg"
        >
          <div className="flex items-center space-x-2 mb-2">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-medium text-indigo-900">
              Preset Applied: {videoPresets.find(p => p.id === selectedPresetId)?.title}
            </span>
          </div>
          <p className="text-sm text-indigo-700">
            The prompt has been automatically filled with optimized content for this video style. 
            You can edit it further or use the AI refiner to customize it for your specific needs.
          </p>
        </motion.div>
      )}
    </div>
  );
};