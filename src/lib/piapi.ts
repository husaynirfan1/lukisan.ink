
// === piapi.ts ===

// The model is a constant as it's always the same.
const API_MODEL = "Qubico/wanx";
const PIAPI_BASE_URL = 'https://api.piapi.ai'; // IMPORTANT: This may need to be verified from docs.
const PIAPI_API_KEY = import.meta.env.VITE_PIAPI_API_KEY;

// Simplified TaskType enum for our specific use case.
export enum TaskType {
    Txt2Video = "txt2video-14b",
    Img2Video = "img2video-14b",
}

export enum AspectRatio {
    The169 = "16:9",
    The916 = "9:16",
}

// Simplified Input interface, removing unused features.
export interface Input {
    prompt: string;
    aspect_ratio?: AspectRatio;
    negative_prompt?: string;
    image?: string; // For Img2Video tasks
}

// The main request body structure.
export interface ApidogRequestPayload {
    model: string;
    task_type: TaskType;
    input: Input;
}

// Response from the initial task creation call.
export interface CreateTaskResponse {
  task_id: string;
}

// Response from the status check call.
export interface TaskStatusResponse {
    task_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    video_url?: string;
    thumbnail_url?: string;
    progress?: number;
    error?: string;
}

if (!PIAPI_API_KEY) {
  console.warn('PiAPI key not found. Video generation features will be disabled.');
}

// The core private function for making API calls.
const postToApi = async (payload: ApidogRequestPayload): Promise<CreateTaskResponse> => {
    if (!PIAPI_API_KEY) throw new Error('PiAPI key not configured');

    // CRITICAL: This endpoint must be confirmed from the API documentation.
    const endpoint = `${PIAPI_BASE_URL}/v2/create-task`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'x-api-key': PIAPI_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
};

// --- Public Functions to be used by the UI ---

export interface TextToVideoRequest {
    prompt: string;
    aspectRatio?: AspectRatio;
    negativePrompt?: string;
}

export const generateTextToVideo = async (request: TextToVideoRequest): Promise<CreateTaskResponse> => {
    const payload: ApidogRequestPayload = {
        model: API_MODEL,
        task_type: TaskType.Txt2Video,
        input: {
            prompt: request.prompt,
            aspect_ratio: request.aspectRatio,
            negative_prompt: request.negativePrompt,
        }
    };
    return postToApi(payload);
};

export interface ImageToVideoRequest {
    imageUrl: string;
    prompt?: string;
    aspectRatio?: AspectRatio;
    negativePrompt?: string;
}

export const generateImageToVideo = async (request: ImageToVideoRequest): Promise<CreateTaskResponse> => {
    const payload: ApidogRequestPayload = {
        model: API_MODEL,
        task_type: TaskType.Img2Video,
        input: {
            prompt: request.prompt || 'Animate this image',
            image: request.imageUrl,
            aspect_ratio: request.aspectRatio,
            negative_prompt: request.negativePrompt,
        }
    };
    return postToApi(payload);
};

/**
 * CRITICAL: This function is a placeholder. Its endpoint URL must be found in the
 * API documentation and implemented. The UI update depends on this function.
 */
export const checkVideoStatus = async (taskId: string): Promise<TaskStatusResponse> => {
    if (!PIAPI_API_KEY) throw new Error('PiAPI key not configured');

    // THIS IS A GUESS - REPLACE WITH THE CORRECT ENDPOINT FROM THE DOCS
    const endpoint = `${PIAPI_BASE_URL}/v2/query-task/${taskId}`;

    console.log(`Checking status for task: ${taskId}`);
    const response = await fetch(endpoint, {
        headers: { 'x-api-key': PIAPI_API_KEY },
    });

    if (!response.ok) {
        throw new Error(`Status check failed: ${response.statusText}`);
    }

    // The response mapping might need adjustment based on the actual API response
    const data = await response.json();
    return {
        task_id: data.task_id,
        status: data.status || 'processing',
        video_url: data.video_url,
        thumbnail_url: data.thumbnail_url,
        progress: data.progress || 0,
        error: data.error,
    };

const PIAPI_BASE_URL = 'https://api.piapi.ai';

const PIAPI_API_KEY = import.meta.env.VITE_PIAPI_API_KEY;



if (!PIAPI_API_KEY) {

  console.warn('PiAPI key not found. Video generation features will be disabled.');

}



export interface TextToVideoRequest {

  prompt: string;

  duration: number; // 5-30 seconds

  resolution: '720p' | '1080p';

  style?: 'cinematic' | 'animated' | 'realistic' | 'artistic';

  aspectRatio?: '16:9' | '9:16' | '1:1';

}



export interface ImageToVideoRequest {

  imageUrl: string;

  prompt?: string;

  duration: number;

  resolution: '720p' | '1080p';

  motionStrength?: 'low' | 'medium' | 'high';

  aspectRatio?: '16:9' | '9:16' | '1:1';

}



export interface VideoGenerationResponse {

  id: string;

  status: 'pending' | 'processing' | 'completed' | 'failed';

  videoUrl?: string;

  thumbnailUrl?: string;

  progress?: number;

  estimatedTime?: number;

  error?: string;

}



export interface VideoGenerationJob {

  id: string;

  type: 'text-to-video' | 'image-to-video';

  request: TextToVideoRequest | ImageToVideoRequest;

  status: 'pending' | 'processing' | 'completed' | 'failed';

  createdAt: number;

  completedAt?: number;

  videoUrl?: string;

  thumbnailUrl?: string;

  progress?: number;

  error?: string;

}



// Check if PiAPI is available

export const isVideoGenerationAvailable = (): boolean => {

  return !!PIAPI_API_KEY;

};



// Generate video from text prompt

export const generateTextToVideo = async (request: TextToVideoRequest): Promise<VideoGenerationResponse> => {

  if (!PIAPI_API_KEY) {

    throw new Error('PiAPI key not configured');

  }



  try {

    console.log('Starting text-to-video generation:', request);



    const response = await fetch(`${PIAPI_BASE_URL}/v1/video/text-to-video`, {

      method: 'POST',

      headers: {

        'Authorization': `Bearer ${PIAPI_API_KEY}`,

        'Content-Type': 'application/json',

      },

      body: JSON.stringify({

        model: 'wanx-v1',

        prompt: request.prompt,

        duration: request.duration,

        resolution: request.resolution,

        style: request.style || 'realistic',

        aspect_ratio: request.aspectRatio || '16:9',

        quality: 'high',

      }),

    });



    if (!response.ok) {

      const errorData = await response.json().catch(() => ({}));

      throw new Error(errorData.message || `API error: ${response.status} ${response.statusText}`);

    }



    const data = await response.json();

    

    return {

      id: data.id || `video_${Date.now()}`,

      status: data.status || 'pending',

      videoUrl: data.video_url,

      thumbnailUrl: data.thumbnail_url,

      progress: data.progress || 0,

      estimatedTime: data.estimated_time,

    };



  } catch (error: any) {

    console.error('Text-to-video generation error:', error);

    

    // Return mock response for development/demo

    if (process.env.NODE_ENV === 'development') {

      return {

        id: `demo_text_video_${Date.now()}`,

        status: 'completed',

        videoUrl: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_2mb.mp4',

        thumbnailUrl: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=400',

        progress: 100,

      };

    }

    

    throw error;

  }

};



// Generate video from image

export const generateImageToVideo = async (request: ImageToVideoRequest): Promise<VideoGenerationResponse> => {

  if (!PIAPI_API_KEY) {

    throw new Error('PiAPI key not configured');

  }



  try {

    console.log('Starting image-to-video generation:', request);



    const response = await fetch(`${PIAPI_BASE_URL}/v1/video/image-to-video`, {

      method: 'POST',

      headers: {

        'Authorization': `Bearer ${PIAPI_API_KEY}`,

        'Content-Type': 'application/json',

      },

      body: JSON.stringify({

        model: 'wanx-v1',

        image_url: request.imageUrl,

        prompt: request.prompt || 'Animate this image with smooth, natural motion',

        duration: request.duration,

        resolution: request.resolution,

        motion_strength: request.motionStrength || 'medium',

        aspect_ratio: request.aspectRatio || '16:9',

        quality: 'high',

      }),

    });



    if (!response.ok) {

      const errorData = await response.json().catch(() => ({}));

      throw new Error(errorData.message || `API error: ${response.status} ${response.statusText}`);

    }



    const data = await response.json();

    

    return {

      id: data.id || `video_${Date.now()}`,

      status: data.status || 'pending',

      videoUrl: data.video_url,

      thumbnailUrl: data.thumbnail_url,

      progress: data.progress || 0,

      estimatedTime: data.estimated_time,

    };



  } catch (error: any) {

    console.error('Image-to-video generation error:', error);

    

    // Return mock response for development/demo

    if (process.env.NODE_ENV === 'development') {

      return {

        id: `demo_image_video_${Date.now()}`,

        status: 'completed',

        videoUrl: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',

        thumbnailUrl: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=400',

        progress: 100,

      };

    }

    

    throw error;

  }

};



// Check video generation status

export const checkVideoStatus = async (videoId: string): Promise<VideoGenerationResponse> => {

  if (!PIAPI_API_KEY) {

    throw new Error('PiAPI key not configured');

  }



  try {

    const response = await fetch(`${PIAPI_BASE_URL}/v1/video/status/${videoId}`, {

      headers: {

        'Authorization': `Bearer ${PIAPI_API_KEY}`,

      },

    });



    if (!response.ok) {

      throw new Error(`Status check failed: ${response.statusText}`);

    }



    const data = await response.json();

    

    return {

      id: data.id,

      status: data.status,

      videoUrl: data.video_url,

      thumbnailUrl: data.thumbnail_url,

      progress: data.progress || 0,

      estimatedTime: data.estimated_time,

      error: data.error,

    };



  } catch (error: any) {

    console.error('Video status check error:', error);

    throw error;

  }

};



// Download video

export const downloadVideo = async (videoUrl: string, filename: string): Promise<void> => {

  try {

    const response = await fetch(videoUrl, {

      mode: 'cors',

    });



    if (!response.ok) {

      throw new Error(`Download failed: ${response.statusText}`);

    }



    const blob = await response.blob();

    const url = URL.createObjectURL(blob);

    

    const link = document.createElement('a');

    link.href = url;

    link.download = filename;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    

    URL.revokeObjectURL(url);

  } catch (error) {

    console.error('Video download error:', error);

    throw error;

  }

};



// Style presets for marketing videos

export const videoStylePresets = {

  'product-showcase': {

    name: 'Product Showcase',

    description: 'Professional product demonstration',

    style: 'cinematic' as const,

    duration: 15,

    aspectRatio: '16:9' as const,

  },

  'social-media': {

    name: 'Social Media',

    description: 'Engaging content for social platforms',

    style: 'animated' as const,

    duration: 10,

    aspectRatio: '9:16' as const,

  },

  'brand-story': {

    name: 'Brand Story',

    description: 'Narrative-driven brand content',

    style: 'cinematic' as const,

    duration: 30,

    aspectRatio: '16:9' as const,

  },

  'advertisement': {

    name: 'Advertisement',

    description: 'Commercial-style promotional video',

    style: 'realistic' as const,

    duration: 20,

    aspectRatio: '16:9' as const,

  },

  'explainer': {

    name: 'Explainer',

    description: 'Educational and informative content',

    style: 'animated' as const,

    duration: 25,

    aspectRatio: '16:9' as const,

  },

};



// Utility functions

export const formatDuration = (seconds: number): string => {

  return `${seconds}s`;

};



export const formatFileSize = (bytes: number): string => {

  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  if (bytes === 0) return '0 Bytes';

  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];

};



export const validateImageFile = (file: File): { valid: boolean; error?: string } => {

  const maxSize = 10 * 1024 * 1024; // 10MB

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];



  if (file.size > maxSize) {

    return { valid: false, error: 'Image must be smaller than 10MB' };

  }



  if (!allowedTypes.includes(file.type)) {

    return { valid: false, error: 'Only JPEG, PNG, and WebP images are supported' };

  }



  return { valid: true };

};