import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Loader2, 
  Download, 
  Wand2, 
  AlertCircle, 
  CheckCircle,
  Settings,
  Palette,
  Crop,
  Sparkles
} from 'lucide-react';
import { 
  removeBackground, 
  downloadProcessedImage, 
  presetConfigurations,
  isBackgroundRemovalAvailable,
  getUsageStats,
  BackgroundRemovalOptions,
  BackgroundRemovalResult
} from '../lib/backgroundRemoval';
import toast from 'react-hot-toast';

interface BackgroundRemovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageName?: string;
}

export const BackgroundRemovalModal: React.FC<BackgroundRemovalModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  imageName = 'logo'
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<BackgroundRemovalResult | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof presetConfigurations>('highQuality');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customOptions, setCustomOptions] = useState<BackgroundRemovalOptions>({});

  const usageStats = getUsageStats();
  const isAvailable = isBackgroundRemovalAvailable();

  const handleRemoveBackground = async () => {
    if (!isAvailable) {
      toast.error('Background removal service is not configured');
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const options = showAdvanced 
        ? { ...presetConfigurations[selectedPreset], ...customOptions }
        : presetConfigurations[selectedPreset];

      console.log('Removing background with options:', options);
      
      const processingResult = await removeBackground(imageUrl, options);
      
      setResult(processingResult);
      
      if (processingResult.success) {
        toast.success('Background removed successfully!');
      } else {
        toast.error(processingResult.error || 'Failed to remove background');
      }
      
    } catch (error: any) {
      console.error('Background removal error:', error);
      toast.error('An unexpected error occurred');
      setResult({
        success: false,
        error: error.message || 'An unexpected error occurred'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (result?.blob) {
      const filename = `${imageName}-no-bg-${Date.now()}.png`;
      await downloadProcessedImage(result.blob, filename);
    }
  };

  const handleReset = () => {
    setResult(null);
    setCustomOptions({});
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        >
          <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200/50">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200/50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg">
                  <Wand2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Remove Background</h2>
                  {/* Only show usage stats in development */}
                  {process.env.NODE_ENV === 'development' && (
                    <p className="text-sm text-gray-600">
                      {isAvailable 
                        ? `${usageStats.requestsRemaining} requests remaining this month`
                        : 'Service not configured'
                      }
                    </p>
                  )}
                </div>
              </div>
              
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {!isAvailable ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Service Not Available</h3>
                  <p className="text-gray-600 mb-4">
                    Background removal requires a Remove.bg API key to be configured.
                  </p>
                  <div className="bg-gray-50 rounded-lg p-4 text-left">
                    <p className="text-sm text-gray-700 mb-2">To enable this feature:</p>
                    <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                      <li>Sign up for a free account at <a href="https://remove.bg" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">remove.bg</a></li>
                      <li>Get your API key from the dashboard</li>
                      <li>Add <code className="bg-gray-200 px-1 rounded">VITE_REMOVE_BG_API_KEY</code> to your environment variables</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Original Image */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Original Image</h3>
                    <div className="bg-gray-100 rounded-lg p-4 aspect-square flex items-center justify-center">
                      <img
                        src={imageUrl}
                        alt="Original logo"
                        className="max-w-full max-h-full object-contain rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Processed Image */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      {result ? 'Processed Image' : 'Preview'}
                    </h3>
                    <div className="bg-gray-100 rounded-lg p-4 aspect-square flex items-center justify-center relative">
                      {/* Checkerboard background for transparency */}
                      <div 
                        className="absolute inset-4 rounded-lg opacity-20"
                        style={{
                          backgroundImage: `
                            linear-gradient(45deg, #ccc 25%, transparent 25%), 
                            linear-gradient(-45deg, #ccc 25%, transparent 25%), 
                            linear-gradient(45deg, transparent 75%, #ccc 75%), 
                            linear-gradient(-45deg, transparent 75%, #ccc 75%)
                          `,
                          backgroundSize: '20px 20px',
                          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                        }}
                      />
                      
                      {isProcessing ? (
                        <div className="text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-2" />
                          <p className="text-sm text-gray-600">Processing image...</p>
                        </div>
                      ) : result?.success && result.imageUrl ? (
                        <img
                          src={result.imageUrl}
                          alt="Processed logo"
                          className="max-w-full max-h-full object-contain rounded-lg relative z-10"
                        />
                      ) : result?.error ? (
                        <div className="text-center text-red-600">
                          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                          <p className="text-sm">{result.error}</p>
                        </div>
                      ) : (
                        <div className="text-center text-gray-500">
                          <Sparkles className="h-8 w-8 mx-auto mb-2" />
                          <p className="text-sm">Processed image will appear here</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Controls */}
              {isAvailable && (
                <div className="mt-8 space-y-6">
                  {/* Preset Selection */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Quality Preset</h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {Object.entries(presetConfigurations).map(([key, config]) => (
                        <button
                          key={key}
                          onClick={() => setSelectedPreset(key as keyof typeof presetConfigurations)}
                          className={`p-3 rounded-lg border text-sm transition-all ${
                            selectedPreset === key
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="font-medium capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {config.size === 'full' ? 'High Quality' : 'Preview'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Advanced Options */}
                  <div>
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                    >
                      <Settings className="h-4 w-4" />
                      <span>{showAdvanced ? 'Hide' : 'Show'} Advanced Options</span>
                    </button>

                    <AnimatePresence>
                      {showAdvanced && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                          {/* Background Color */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Background Color
                            </label>
                            <div className="flex items-center space-x-2">
                              <Palette className="h-4 w-4 text-gray-400" />
                              <input
                                type="color"
                                value={`#${customOptions.bg_color || 'ffffff'}`}
                                onChange={(e) => setCustomOptions(prev => ({
                                  ...prev,
                                  bg_color: e.target.value.replace('#', '')
                                }))}
                                className="w-12 h-8 rounded border border-gray-300"
                              />
                              <input
                                type="text"
                                placeholder="ffffff"
                                value={customOptions.bg_color || ''}
                                onChange={(e) => setCustomOptions(prev => ({
                                  ...prev,
                                  bg_color: e.target.value.replace('#', '')
                                }))}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                            </div>
                          </div>

                          {/* Crop */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Auto Crop
                            </label>
                            <div className="flex items-center space-x-2">
                              <Crop className="h-4 w-4 text-gray-400" />
                              <input
                                type="checkbox"
                                checked={customOptions.crop || false}
                                onChange={(e) => setCustomOptions(prev => ({
                                  ...prev,
                                  crop: e.target.checked
                                }))}
                                className="rounded border-gray-300"
                              />
                              <span className="text-sm text-gray-600">Automatically crop to content</span>
                            </div>
                          </div>

                          {/* Add Shadow */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Add Shadow
                            </label>
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={customOptions.add_shadow || false}
                                onChange={(e) => setCustomOptions(prev => ({
                                  ...prev,
                                  add_shadow: e.target.checked
                                }))}
                                className="rounded border-gray-300"
                              />
                              <span className="text-sm text-gray-600">Add realistic shadow</span>
                            </div>
                          </div>

                          {/* Type */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Detection Type
                            </label>
                            <select
                              value={customOptions.type || 'auto'}
                              onChange={(e) => setCustomOptions(prev => ({
                                ...prev,
                                type: e.target.value as any
                              }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value="auto">Auto Detect</option>
                              <option value="person">Person</option>
                              <option value="product">Product/Logo</option>
                              <option value="car">Car</option>
                            </select>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <div className="flex items-center space-x-3">
                      {result?.success && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={handleDownload}
                          className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Download className="h-4 w-4" />
                          <span>Download</span>
                        </motion.button>
                      )}
                      
                      {result && (
                        <button
                          onClick={handleReset}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    <div className="flex items-center space-x-3">
                      <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleRemoveBackground}
                        disabled={isProcessing}
                        className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-4 w-4" />
                            <span>Remove Background</span>
                          </>
                        )}
                      </motion.button>
                    </div>
                  </div>

                  {/* Usage Info - Only in development */}
                  {process.env.NODE_ENV === 'development' && result?.creditsRemaining !== undefined && (
                    <div className="text-center text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                      <CheckCircle className="h-4 w-4 inline mr-1 text-green-500" />
                      Credits remaining: {result.creditsRemaining}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};