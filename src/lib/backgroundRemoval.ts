import toast from 'react-hot-toast';

// Remove.bg API configuration
const REMOVE_BG_API_KEY = import.meta.env.VITE_REMOVE_BG_API_KEY;
const REMOVE_BG_API_URL = 'https://api.remove.bg/v1.0/removebg';

// Rate limiting configuration (for debug tracking only)
const RATE_LIMIT = {
  maxRequests: 50, // Free tier limit per month
  requestsUsed: 0,
  resetDate: new Date(),
};

export interface BackgroundRemovalOptions {
  size?: 'preview' | 'full' | 'auto';
  type?: 'auto' | 'person' | 'product' | 'car';
  format?: 'auto' | 'png' | 'jpg';
  roi?: string; // Region of interest (x1,y1,x2,y2)
  crop?: boolean;
  crop_margin?: string;
  scale?: string;
  position?: string;
  channels?: 'rgba' | 'alpha';
  add_shadow?: boolean;
  semitransparency?: boolean;
  bg_color?: string; // Hex color for background replacement
  bg_image_url?: string; // URL for background replacement image
}

export interface BackgroundRemovalResult {
  success: boolean;
  imageUrl?: string;
  blob?: Blob;
  error?: string;
  creditsUsed?: number;
  creditsRemaining?: number;
  rateLimit?: {
    remaining: number;
    resetTime: Date;
  };
}

// Check if API key is configured
export const isBackgroundRemovalAvailable = (): boolean => {
  return !!REMOVE_BG_API_KEY;
};

// Check rate limits (debug only)
const checkRateLimit = (): { allowed: boolean; message?: string } => {
  const now = new Date();
  
  // Reset counter if it's a new month
  if (now.getMonth() !== RATE_LIMIT.resetDate.getMonth() || 
      now.getFullYear() !== RATE_LIMIT.resetDate.getFullYear()) {
    RATE_LIMIT.requestsUsed = 0;
    RATE_LIMIT.resetDate = now;
  }

  if (RATE_LIMIT.requestsUsed >= RATE_LIMIT.maxRequests) {
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      allowed: false,
      message: `Rate limit exceeded. Resets on ${nextReset.toLocaleDateString()}`
    };
  }

  return { allowed: true };
};

// Convert image URL to blob for API upload
const urlToBlob = async (url: string): Promise<Blob> => {
  try {
    const response = await fetch(url, {
      mode: 'cors',
      headers: {
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    return await response.blob();
  } catch (error) {
    console.error('Error converting URL to blob:', error);
    throw new Error('Failed to process image for background removal');
  }
};

// Validate image for background removal
const validateImage = (blob: Blob): { valid: boolean; message?: string } => {
  // Check file size (max 12MB for remove.bg)
  const maxSize = 12 * 1024 * 1024; // 12MB
  if (blob.size > maxSize) {
    return {
      valid: false,
      message: 'Image too large. Maximum size is 12MB.'
    };
  }

  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(blob.type)) {
    return {
      valid: false,
      message: 'Unsupported image format. Use JPEG, PNG, or WebP.'
    };
  }

  return { valid: true };
};

// Main background removal function
export const removeBackground = async (
  imageUrl: string,
  options: BackgroundRemovalOptions = {}
): Promise<BackgroundRemovalResult> => {
  // Check if API key is configured
  if (!REMOVE_BG_API_KEY) {
    return {
      success: false,
      error: 'Remove.bg API key not configured. Please add VITE_REMOVE_BG_API_KEY to your environment variables.'
    };
  }

  // Check rate limits (debug only)
  const rateLimitCheck = checkRateLimit();
  if (!rateLimitCheck.allowed) {
    return {
      success: false,
      error: rateLimitCheck.message || 'Rate limit exceeded'
    };
  }

  try {
    console.log('Starting background removal for:', imageUrl);
    
    // Convert URL to blob
    const imageBlob = await urlToBlob(imageUrl);
    
    // Validate image
    const validation = validateImage(imageBlob);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.message
      };
    }

    // Prepare form data
    const formData = new FormData();
    formData.append('image_file', imageBlob);
    
    // Add options to form data
    if (options.size) formData.append('size', options.size);
    if (options.type) formData.append('type', options.type);
    if (options.format) formData.append('format', options.format);
    if (options.roi) formData.append('roi', options.roi);
    if (options.crop !== undefined) formData.append('crop', options.crop.toString());
    if (options.crop_margin) formData.append('crop_margin', options.crop_margin);
    if (options.scale) formData.append('scale', options.scale);
    if (options.position) formData.append('position', options.position);
    if (options.channels) formData.append('channels', options.channels);
    if (options.add_shadow !== undefined) formData.append('add_shadow', options.add_shadow.toString());
    if (options.semitransparency !== undefined) formData.append('semitransparency', options.semitransparency.toString());
    if (options.bg_color) formData.append('bg_color', options.bg_color);
    if (options.bg_image_url) formData.append('bg_image_url', options.bg_image_url);

    console.log('Sending request to remove.bg API...');

    // Make API request
    const response = await fetch(REMOVE_BG_API_URL, {
      method: 'POST',
      headers: {
        'X-Api-Key': REMOVE_BG_API_KEY,
      },
      body: formData,
    });

    // Update rate limit counter (debug tracking)
    RATE_LIMIT.requestsUsed++;

    // Get rate limit info from headers
    const creditsRemaining = response.headers.get('X-Credits-Remaining');
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    const rateLimitReset = response.headers.get('X-RateLimit-Reset');

    if (!response.ok) {
      let errorMessage = 'Background removal failed';
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.errors?.[0]?.title || errorData.message || errorMessage;
      } catch {
        errorMessage = `API Error: ${response.status} ${response.statusText}`;
      }

      console.error('Remove.bg API error:', response.status, errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        creditsRemaining: creditsRemaining ? parseInt(creditsRemaining) : undefined,
        rateLimit: rateLimitRemaining ? {
          remaining: parseInt(rateLimitRemaining),
          resetTime: rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000) : new Date()
        } : undefined
      };
    }

    // Get the processed image
    const resultBlob = await response.blob();
    const resultUrl = URL.createObjectURL(resultBlob);

    console.log('Background removal successful');
    if (process.env.NODE_ENV === 'development') {
      console.log('Credits remaining:', creditsRemaining);
    }

    return {
      success: true,
      imageUrl: resultUrl,
      blob: resultBlob,
      creditsUsed: 1,
      creditsRemaining: creditsRemaining ? parseInt(creditsRemaining) : undefined,
      rateLimit: rateLimitRemaining ? {
        remaining: parseInt(rateLimitRemaining),
        resetTime: rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000) : new Date()
      } : undefined
    };

  } catch (error: any) {
    console.error('Background removal error:', error);
    
    let errorMessage = 'An unexpected error occurred during background removal';
    if (error.message.includes('fetch')) {
      errorMessage = 'Network error. Please check your connection and try again.';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Request timed out. Please try again.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage
    };
  }
};

// Batch background removal for multiple images
export const removeBackgroundBatch = async (
  imageUrls: string[],
  options: BackgroundRemovalOptions = {},
  onProgress?: (completed: number, total: number) => void
): Promise<BackgroundRemovalResult[]> => {
  const results: BackgroundRemovalResult[] = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    
    try {
      const result = await removeBackground(url, options);
      results.push(result);
      
      // Call progress callback
      onProgress?.(i + 1, imageUrls.length);
      
      // Add delay between requests to respect rate limits
      if (i < imageUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      results.push({
        success: false,
        error: `Failed to process image ${i + 1}: ${error}`
      });
    }
  }
  
  return results;
};

// Download processed image
export const downloadProcessedImage = async (
  blob: Blob,
  filename: string = `logo-no-bg-${Date.now()}.png`
): Promise<void> => {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
    toast.success('Image downloaded successfully!');
  } catch (error) {
    console.error('Download error:', error);
    toast.error('Failed to download image');
  }
};

// Get API usage statistics (debug only)
export const getUsageStats = (): {
  requestsUsed: number;
  requestsRemaining: number;
  resetDate: Date;
} => {
  return {
    requestsUsed: RATE_LIMIT.requestsUsed,
    requestsRemaining: Math.max(0, RATE_LIMIT.maxRequests - RATE_LIMIT.requestsUsed),
    resetDate: new Date(RATE_LIMIT.resetDate.getFullYear(), RATE_LIMIT.resetDate.getMonth() + 1, 1)
  };
};

// Preset configurations for common use cases
export const presetConfigurations = {
  // High quality for final logos
  highQuality: {
    size: 'full' as const,
    type: 'auto' as const,
    format: 'png' as const,
    channels: 'rgba' as const,
  },
  
  // Fast preview for testing
  preview: {
    size: 'preview' as const,
    type: 'auto' as const,
    format: 'png' as const,
  },
  
  // Product/logo optimized
  product: {
    size: 'full' as const,
    type: 'product' as const,
    format: 'png' as const,
    channels: 'rgba' as const,
    crop: true,
  },
  
  // With white background
  whiteBackground: {
    size: 'full' as const,
    type: 'auto' as const,
    format: 'png' as const,
    bg_color: 'ffffff',
  },
  
  // With shadow effect
  withShadow: {
    size: 'full' as const,
    type: 'auto' as const,
    format: 'png' as const,
    add_shadow: true,
  },
};