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
  icon: React.ElementType;
  category: string;
  duration: number;
  prompt: string;
  negative_prompt: string;
}

export const videoPresets: VideoPreset[] = [
  {
    id: 'modern-product-showcase',
    title: 'Modern Product Showcase',
    description: 'Clean, dynamic, and focused on the product\'s design and features',
    icon: Package,
    category: 'product',
    duration: 30,
    prompt: 'Minimalist 3D product render of [Your Product Name] in a sleek, modern studio setting with precise lighting, dark background, and subtle reflections that accentuate the product\'s features in stunning 8K resolution, hyper-detailed textures, and crisp lines. A slow, sweeping camera orbit smoothly revolves around the product, showcasing its design from multiple angles. Clean, sans-serif text overlays gradually fade in to highlight key benefits, such as innovative technology and premium quality, in a sophisticated and elegant manner. The camera zooms in on the product\'s details, emphasizing its premium aesthetic.',
    negative_prompt: 'Blurry, grainy, low-resolution, distorted, warped, cluttered background, amateurish, ugly, bad lighting.'
  },
  {
    id: 'high-energy-teaser',
    title: 'High-Energy Teaser',
    description: 'Fast-paced and exciting, perfect for a new launch or event',
    icon: Zap,
    category: 'marketing',
    duration: 15,
    prompt: 'High-energy teaser video with dynamic fast cuts and energetic transitions, incorporating whip pans, glitch effects, and strobing lights. The kinetic typography features bold, vibrant neon colors with high contrast, as text scales and pulses to the beat, accompanied by particle effects and lens flares. The camera rapidly zooms and pans across the scene, capturing the intensity. As the video builds up, it culminates in a dramatic reveal of [Your Product/Event Name] with a powerful logo animation that explodes into view, filling the screen with an electrifying presence. Close-up shots emphasize the logo.',
    negative_prompt: 'Slow, calm, boring, static, blurry, out of focus, flat colors, peaceful.'
  },
  {
    id: 'animated-explainer',
    title: 'Animated Explainer Video',
    description: 'Friendly and informative, using 2D animation to explain a service or concept',
    icon: PlayCircle,
    category: 'explainer',
    duration: 60,
    prompt: '2D animated explainer video in a vibrant flat design style, featuring friendly characters with exaggerated, expressive gestures and smooth motion graphics. Infographic elements such as animated charts, progress bars, and icons dynamically illustrate key concepts. The scene showcases [Your Service/Concept] in action, with characters engaging in natural actions like nodding or gesturing. Subtle background element movement and slight breathing motion add depth. Bright and approachable brand colors create a welcoming atmosphere. Medium shot, gentle camera pans and zooms emphasize the characters and graphics, conveying a sense of approachability and professionalism throughout.',
    negative_prompt: 'Photorealistic, 3D, complex textures, shaky, hand-drawn, blurry, mismatched colors.'
  },
  {
    id: 'cinematic-brand-story',
    title: 'Cinematic Brand Story',
    description: 'Emotional and narrative-driven, telling the story behind your brand',
    icon: Heart,
    category: 'brand',
    duration: 60,
    prompt: 'Cinematic, emotional, and authentic brand story film, showcasing a poignant moment that embodies [Your Brand\'s Story Moment]. Soft, natural golden hour lighting bathes the scene, complemented by a warm color grade and shallow depth of field, creating a beautiful bokeh effect. A slow-motion shot masterfully captures the key emotional moment, as gentle camera drift subtly enhances the atmosphere. The subject\'s hair flows softly in the breeze, with dust motes delicately floating in the air. Medium shot, character eye-level, with a subtle pan and slow zoom, emphasizing the emotional intensity of the moment.',
    negative_prompt: 'Corporate, sterile, harsh lighting, flat, oversaturated, fast cuts, shaky camera, uninspired.'
  },
  {
    id: 'customer-testimonial',
    title: 'Customer Testimonial',
    description: 'Authentic and trustworthy, featuring a satisfied customer\'s experience',
    icon: MessageSquare,
    category: 'testimonial',
    duration: 45, 
    prompt: 'Professional customer testimonial video in a modern corporate style, featuring a medium close-up shot of a genuine customer speaking directly to the camera. The background is a well-lit, contemporary office with a soft focus effect, blurred to emphasize the customer. The person displays subtle, natural motions like occasional blinking and slight head movements. A clean, animated lower-third graphic overlays the footage, showcasing the customer\'s name in a clear, easy-to-read font. The camera remains steady, capturing the testimonial in crisp, high-definition quality with crystal clear audio, highlighting the customer\'s sincere expression and words.',
    negative_prompt: 'Dark, underexposed, shaky camera, distracting background, out of focus, amateur, cluttered, bad audio sync (visual representation).'
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