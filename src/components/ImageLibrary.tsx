import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Images, 
  Download, 
  Trash2, 
  Clock, 
  Crown, 
  Calendar,
  Search,
  Filter,
  Grid3X3,
  List,
  AlertTriangle,
  Loader2,
  Cloud,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { downloadImageFromSupabase, deleteImageFromSupabase } from '../lib/imageStorage';
import toast from 'react-hot-toast';

interface StoredImage {
  id: string;
  user_id: string;
  prompt: string;
  category: string;
  image_url: string;
  created_at: string;
  expires_at?: string;
  storage_path?: string;
}

export const ImageLibrary: React.FC = () => {
  const { user, getUserTier } = useAuth();
  const [images, setImages] = useState<StoredImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const userTier = getUserTier();
  const isProUser = userTier === 'pro';

  useEffect(() => {
    if (user) {
      fetchImages();
    }
  }, [user]);

  const fetchImages = async (showLoading = true) => {
    if (!user) return;

    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      console.log('Fetching images for user:', user.id);
      
      const { data, error } = await supabase
        .from('logo_generations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching images:', error);
        toast.error('Failed to load image library');
        return;
      }

      console.log('Fetched images from database:', data?.length || 0);

      // Calculate expiration times for free users
      const imagesWithExpiration = (data || []).map(image => {
        if (!isProUser) {
          const createdAt = new Date(image.created_at);
          const expiresAt = new Date(createdAt.getTime() + (2 * 60 * 60 * 1000)); // 2 hours
          return {
            ...image,
            expires_at: expiresAt.toISOString(),
            storage_path: extractStoragePath(image.image_url)
          };
        }
        return {
          ...image,
          storage_path: extractStoragePath(image.image_url)
        };
      });

      setImages(imagesWithExpiration);
      console.log('Updated local state with images:', imagesWithExpiration.length);
    } catch (error) {
      console.error('Error fetching images:', error);
      toast.error('Failed to load image library');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Extract storage path from Supabase URL
  const extractStoragePath = (url: string): string | undefined => {
    if (!url.includes('supabase.co/storage/v1/object/public/generated-images/')) {
      return undefined;
    }
    
    const parts = url.split('/generated-images/');
    return parts[1];
  };

  // Check if image is expired
  const isImageExpired = (image: StoredImage): boolean => {
    if (isProUser || !image.expires_at) return false;
    return new Date() > new Date(image.expires_at);
  };

  // Get time until expiration
  const getTimeUntilExpiration = (image: StoredImage): string => {
    if (isProUser || !image.expires_at) return '';
    
    const now = new Date();
    const expiresAt = new Date(image.expires_at);
    const diff = expiresAt.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Filter images based on search and category
  const filteredImages = images.filter(image => {
    const matchesSearch = image.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         image.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || image.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = ['all', ...Array.from(new Set(images.map(img => img.category)))];

  const handleDownload = async (image: StoredImage) => {
    try {
      if (isImageExpired(image)) {
        toast.error('This image has expired and cannot be downloaded');
        return;
      }

      const filename = `logo-${image.category}-${Date.now()}.png`;
      
      if (image.image_url.includes('supabase.co')) {
        await downloadImageFromSupabase(image.image_url, filename);
        toast.success('High-quality image downloaded!');
      } else {
        // Fallback for external URLs
        const link = document.createElement('a');
        link.href = image.image_url;
        link.download = filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Image downloaded!');
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download image');
    }
  };

// Refactored handler for single image deletion
  const handleDelete = async (imageId: string) => {
    const imageToDelete = images.find(img => img.id === imageId);
    if (!imageToDelete) return;

    console.log('=== STARTING SINGLE DELETION ===');
    setDeletingImages(prev => new Set(prev).add(imageId));

    try {
      await performDeletion([imageToDelete]);

      // Optimistic UI update
      setImages(prev => prev.filter(img => img.id !== imageId));
      setSelectedImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(imageId);
        return newSet;
      });

      toast.success('Image deleted successfully');
      console.log('=== SINGLE DELETION COMPLETED SUCCESSFULLY ===');

    } catch (error: any) {
      console.error('=== SINGLE DELETION FAILED ===', error);
      toast.error(`Failed to delete image: ${error.message}`);
      // On failure, refresh the data to ensure UI is consistent with the server
      fetchImages(false);
    } finally {
      setDeletingImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(imageId);
        return newSet;
      });
    }
  };

  // Refactored handler for bulk image deletion
  const handleBulkDelete = async () => {
    if (selectedImages.size === 0) return;

    const confirmed = window.confirm(`Are you sure you want to delete ${selectedImages.size} image(s)?`);
    if (!confirmed) return;

    const imagesToDelete = images.filter(img => selectedImages.has(img.id));
    const imageIdsToDelete = imagesToDelete.map(img => img.id);

    console.log('=== STARTING BULK DELETION ===');
    setDeletingImages(prev => new Set([...prev, ...imageIdsToDelete]));

    try {
      await performDeletion(imagesToDelete);

      // Optimistic UI update
      setImages(prev => prev.filter(img => !selectedImages.has(img.id)));
      setSelectedImages(new Set());

      toast.success(`Successfully deleted ${imagesToDelete.length} image(s)`);
      console.log('=== BULK DELETION COMPLETED SUCCESSFULLY ===');

    } catch (error: any) {
      console.error('=== BULK DELETION FAILED ===', error);
      toast.error(`Bulk deletion failed: ${error.message}`);
      fetchImages(false); // Force refresh on failure
    } finally {
      setDeletingImages(prev => {
        const newSet = new Set(prev);
        imageIdsToDelete.forEach(id => newSet.delete(id));
        return newSet;
      });
    }
  };
  const toggleImageSelection = (imageId: string) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    const visibleIds = filteredImages.map(img => img.id);
    setSelectedImages(new Set(visibleIds));
  };

  const clearSelection = () => {
    setSelectedImages(new Set());
  };

  // Manual refresh function
  const handleRefresh = () => {
    console.log('Manual refresh triggered');
    fetchImages(false);
    toast.success('Library refreshed');
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <Images className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Generated Logo Library</h2>
          <p className="text-gray-600">Sign in to view your generated images</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
              <Images className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Generated Logo Library</h1>
              <p className="text-gray-600">
                {isProUser ? 'Your images are stored until subscription ends' : 'Free images expire after 2 hours'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Refresh button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm">Refresh</span>
            </motion.button>
            
            {!isProUser && (
              <div className="flex items-center space-x-2 px-4 py-2 bg-orange-100 text-orange-800 rounded-lg">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">Auto-delete in 2h</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Images className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Images</p>
                <p className="text-xl font-bold text-gray-900">{images.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Cloud className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">High Quality</p>
                <p className="text-xl font-bold text-gray-900">
                  {images.filter(img => img.image_url.includes('supabase.co')).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${isProUser ? 'bg-yellow-100' : 'bg-red-100'}`}>
                {isProUser ? (
                  <Crown className="h-5 w-5 text-yellow-600" />
                ) : (
                  <Clock className="h-5 w-5 text-red-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-gray-600">
                  {isProUser ? 'Pro Storage' : 'Expiring Soon'}
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {isProUser ? 'Unlimited' : images.filter(img => !isImageExpired(img)).length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search images..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none bg-white"
              >
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category === 'all' ? 'All Categories' : category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* View Mode and Actions */}
          <div className="flex items-center space-x-4">
            {selectedImages.size > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">{selectedImages.size} selected</span>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center space-x-1 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors text-sm"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Delete</span>
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <button
                onClick={selectAllVisible}
                className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors text-sm"
              >
                Select All
              </button>
              
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                  }`}
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                  }`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <span className="ml-2 text-gray-600">Loading your images...</span>
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="text-center py-12">
          <Images className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {images.length === 0 ? 'No images yet' : 'No images match your search'}
          </h3>
          <p className="text-gray-600 mb-6">
            {images.length === 0 
              ? 'Generate your first logo to see it here' 
              : 'Try adjusting your search terms or filters'
            }
          </p>
        </div>
      ) : (
        <AnimatePresence>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredImages.map((image, index) => {
                const isExpired = isImageExpired(image);
                const timeLeft = getTimeUntilExpiration(image);
                const isSelected = selectedImages.has(image.id);
                const isDeleting = deletingImages.has(image.id);
                const isHighQuality = image.image_url.includes('supabase.co');

                return (
                  <motion.div
                    key={image.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                    className={`bg-white rounded-xl shadow-md overflow-hidden border-2 transition-all duration-200 ${
                      isSelected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-transparent'
                    } ${isExpired ? 'opacity-60' : ''} ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {/* Image */}
                    <div className="relative aspect-square bg-gray-100">
                      <img
                        src={image.image_url}
                        alt={`Generated logo - ${image.category}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop';
                        }}
                      />
                      
                      {/* Selection overlay */}
                      <div 
                        className="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center"
                        onClick={() => toggleImageSelection(image.id)}
                      >
                        <div className={`w-6 h-6 rounded border-2 border-white ${
                          isSelected ? 'bg-indigo-500' : 'bg-transparent'
                        } flex items-center justify-center`}>
                          {isSelected && <span className="text-white text-xs">✓</span>}
                        </div>
                      </div>

                      {/* Status badges */}
                      <div className="absolute top-2 left-2 flex flex-col space-y-1">
                        {isHighQuality && (
                          <div className="flex items-center space-x-1 px-2 py-1 bg-green-500 text-white rounded-full text-xs">
                            <Cloud className="h-3 w-3" />
                            <span>HQ</span>
                          </div>
                        )}
                        
                        {isExpired && (
                          <div className="flex items-center space-x-1 px-2 py-1 bg-red-500 text-white rounded-full text-xs">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Expired</span>
                          </div>
                        )}
                        
                        {!isProUser && !isExpired && timeLeft && (
                          <div className="flex items-center space-x-1 px-2 py-1 bg-orange-500 text-white rounded-full text-xs">
                            <Clock className="h-3 w-3" />
                            <span>{timeLeft}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <div className="mb-3">
                        <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                          {image.prompt.length > 50 ? `${image.prompt.substring(0, 50)}...` : image.prompt}
                        </h3>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 capitalize">{image.category}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(image.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex space-x-2">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleDownload(image)}
                          disabled={isExpired || isDeleting}
                          className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download className="h-3 w-3" />
                          <span>Download</span>
                        </motion.button>
                        
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleDelete(image.id)}
                          disabled={isDeleting}
                          className="flex items-center justify-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 overflow-hidden">
              <div className="divide-y divide-gray-200">
                {filteredImages.map((image, index) => {
                  const isExpired = isImageExpired(image);
                  const timeLeft = getTimeUntilExpiration(image);
                  const isSelected = selectedImages.has(image.id);
                  const isDeleting = deletingImages.has(image.id);
                  const isHighQuality = image.image_url.includes('supabase.co');

                  return (
                    <motion.div
                      key={image.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: index * 0.02 }}
                      className={`p-4 hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-indigo-50' : ''
                      } ${isExpired ? 'opacity-60' : ''} ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <div className="flex items-center space-x-4">
                        {/* Selection checkbox */}
                        <button
                          onClick={() => toggleImageSelection(image.id)}
                          className={`w-5 h-5 rounded border-2 ${
                            isSelected 
                              ? 'bg-indigo-500 border-indigo-500' 
                              : 'border-gray-300 hover:border-indigo-400'
                          } flex items-center justify-center transition-colors`}
                        >
                          {isSelected && <span className="text-white text-xs">✓</span>}
                        </button>

                        {/* Thumbnail */}
                        <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                          <img
                            src={image.image_url}
                            alt={`Generated logo - ${image.category}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = 'https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&cs=tinysrgb&w=64&h=64&fit=crop';
                            }}
                          />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate">{image.prompt}</h3>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-sm text-gray-600 capitalize">{image.category}</span>
                            <span className="text-sm text-gray-500">
                              {new Date(image.created_at).toLocaleDateString()}
                            </span>
                            
                            {/* Status badges */}
                            <div className="flex items-center space-x-2">
                              {isHighQuality && (
                                <div className="flex items-center space-x-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                                  <Cloud className="h-3 w-3" />
                                  <span>HQ</span>
                                </div>
                              )}
                              
                              {isExpired && (
                                <div className="flex items-center space-x-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span>Expired</span>
                                </div>
                              )}
                              
                              {!isProUser && !isExpired && timeLeft && (
                                <div className="flex items-center space-x-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
                                  <Clock className="h-3 w-3" />
                                  <span>{timeLeft}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-2">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleDownload(image)}
                            disabled={isExpired || isDeleting}
                            className="flex items-center space-x-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Download className="h-3 w-3" />
                            <span>Download</span>
                          </motion.button>
                          
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleDelete(image.id)}
                            disabled={isDeleting}
                            className="flex items-center justify-center p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};