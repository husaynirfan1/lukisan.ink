import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Wand2, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { refineVideoPrompt } from '../../lib/fireworks';
import toast from 'react-hot-toast';

interface AIPromptRefinerProps {
  currentPrompt: string;
  onRefinedPrompt: (refinedPrompt: string) => void;
  disabled?: boolean;
}

export const AIPromptRefiner: React.FC<AIPromptRefinerProps> = ({
  currentPrompt,
  onRefinedPrompt,
  disabled = false
}) => {
  const [isRefining, setIsRefining] = useState(false);
  const [lastRefinedPrompt, setLastRefinedPrompt] = useState<string>('');

  const handleRefinePrompt = async () => {
    if (!currentPrompt.trim()) {
      toast.error('Please enter a video description first');
      return;
    }

    if (currentPrompt.length < 10) {
      toast.error('Please provide a more detailed description for better AI refinement');
      return;
    }

    setIsRefining(true);

    try {
      console.log('Refining video prompt:', currentPrompt);
      
      const refinedPrompt = await refineVideoPrompt(currentPrompt);
      
      if (refinedPrompt && refinedPrompt !== currentPrompt) {
        setLastRefinedPrompt(refinedPrompt);
        onRefinedPrompt(refinedPrompt);
        toast.success('Prompt refined successfully! ✨');
      } else {
        toast.info('Your prompt is already well-optimized!');
      }
    } catch (error: any) {
      console.error('Error refining prompt:', error);
      toast.error('Failed to refine prompt. Please try again.');
    } finally {
      setIsRefining(false);
    }
  };

  const isPromptRefined = lastRefinedPrompt === currentPrompt;

  return (
    <div className="flex items-center space-x-3">
      <motion.button
        whileHover={{ scale: disabled || isRefining ? 1 : 1.05 }}
        whileTap={{ scale: disabled || isRefining ? 1 : 0.95 }}
        onClick={handleRefinePrompt}
        disabled={disabled || isRefining || !currentPrompt.trim()}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
          isPromptRefined
            ? 'bg-green-100 text-green-700 border border-green-300'
            : 'bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:from-purple-600 hover:to-pink-700 shadow-md hover:shadow-lg'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isRefining ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Refining...</span>
          </>
        ) : isPromptRefined ? (
          <>
            <CheckCircle className="h-4 w-4" />
            <span>Refined ✨</span>
          </>
        ) : (
          <>
            <Wand2 className="h-4 w-4" />
            <span>Refine with AI ✨</span>
          </>
        )}
      </motion.button>

      {/* Refinement Tips */}
      {!currentPrompt.trim() && (
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <AlertCircle className="h-4 w-4" />
          <span>Enter a description to enable AI refinement</span>
        </div>
      )}

      {currentPrompt.trim() && currentPrompt.length < 10 && (
        <div className="flex items-center space-x-2 text-sm text-orange-600">
          <AlertCircle className="h-4 w-4" />
          <span>Add more details for better AI refinement</span>
        </div>
      )}
    </div>
  );
};