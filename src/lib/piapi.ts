// =======================================================================
// SIMPLIFIED API INTERFACES
// =======================================================================

// Model is now a constant since we only use one.
const API_MODEL = "Qubico/wanx";

// TaskType enum is simplified to only the two types you need.
export enum TaskType {
    Txt2Video = "txt2video-14b",
    Img2Video = "img2video-14b",
}

export enum AspectRatio {
    The169 = "16:9",
    The916 = "9:16",
    The11 = "1:1",
}

// The main Input interface is now much cleaner.
export interface Input {
    prompt: string;
    aspect_ratio?: AspectRatio;
    negative_prompt?: string;
    image?: string; // Used only for Img2Video tasks
}

// The structure of the request body we will build.
export interface ApidogRequestPayload {
    model: string;
    task_type: TaskType;
    input: Input;
}

// =======================================================================
// REFACTORED API SERVICE
// =======================================================================

const PIAPI_BASE_URL = 'https://api.piapi.ai';
const PIAPI_API_KEY = import.meta.env.VITE_PIAPI_API_KEY;

if (!PIAPI_API_KEY) {
  console.warn('PiAPI key not found. Video generation features will be disabled.');
}

// Response from creating a task - Updated based on PiAPI docs
export interface CreateTaskResponse {
  task_id: string;
  status?: string;
  message?: string;
}

// FIXED: Response from the status check call - Updated to match actual PiAPI response structure
export interface TaskStatusResponse {
    task_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    video_url?: string;
    thumbnail_url?: string;
    progress?: number;
    error?: string;
    // FIXED: Add the actual response structure from PiAPI
    data?: {
        task_id: string;
        status: string;
        works?: Array<{
            resource?: {
                resourceWithoutWatermark?: string;
                resource?: string;
            };
            cover?: {
                resource?: string;
            };
        }>;
    };
}

// Check if the API is available
export const isVideoGenerationAvailable = (): boolean => {
  return !!PIAPI_API_KEY;
};

// --- Core API Function (Internal) ---
// This private function sends the actual request.
const postToApi = async (payload: ApidogRequestPayload): Promise<CreateTaskResponse> => {
    if (!PIAPI_API_KEY) {
        throw new Error('PiAPI key not configured');
    }
    
    const endpoint = `${PIAPI_BASE_URL}/api/v1/task`;

    console.log('Sending request to PiAPI:', {
        endpoint,
        payload: JSON.stringify(payload, null, 2)
    });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'x-api-key': PIAPI_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    console.log('PiAPI response status:', response.status, response.statusText);

    if (!response.ok) {
        const errorText = await response.text();
        console.error('PiAPI error response:', errorText);
        
        let errorData;
        try {
            errorData = JSON.parse(errorText);
        } catch {
            errorData = { message: errorText };
        }
        
        throw new Error(errorData.message || `API error: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log('PiAPI response data:', responseData);

    // FIXED: Handle the actual response structure from PiAPI
    if (!responseData) {
        throw new Error('Empty response from PiAPI service');
    }

    // FIXED: Extract task_id from the correct location in the response
    let taskId;
    if (responseData.data && responseData.data.task_id) {
        taskId = responseData.data.task_id;
    } else if (responseData.task_id) {
        taskId = responseData.task_id;
    } else {
        console.error('Invalid task_id in response:', responseData);
        throw new Error('PiAPI service returned an invalid or missing task_id. Response: ' + JSON.stringify(responseData));
    }

    // Validate task_id
    if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
        console.error('Invalid task_id in response:', responseData);
        throw new Error('PiAPI service returned an invalid or missing task_id. Response: ' + JSON.stringify(responseData));
    }

    // Return the response in the expected format
    return {
        task_id: taskId,
        status: responseData.data?.status || responseData.status,
        message: responseData.message
    };
};

// --- Simplified Public Functions ---

export interface TextToVideoRequest {
    prompt: string;
    aspectRatio?: AspectRatio;
    negativePrompt?: string;
}

export const generateTextToVideo = async (request: TextToVideoRequest): Promise<CreateTaskResponse> => {
    console.log("Building Text-to-Video request:", request);

    const payload: ApidogRequestPayload = {
        model: API_MODEL,
        task_type: TaskType.Txt2Video,
        input: {
            prompt: request.prompt,
            aspect_ratio: request.aspectRatio || AspectRatio.The169,
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
    console.log("Building Image-to-Video request:", request);

    const payload: ApidogRequestPayload = {
        model: API_MODEL,
        task_type: TaskType.Img2Video,
        input: {
            prompt: request.prompt || 'Animate this image with natural motion',
            image: request.imageUrl,
            aspect_ratio: request.aspectRatio || AspectRatio.The169,
            negative_prompt: request.negativePrompt,
        }
    };

    return postToApi(payload);
};

/**
 * COMPLETELY FIXED: Check the status of a video generation task
 * This function polls the PiAPI status endpoint to get real-time updates
 */
export const checkVideoStatus = async (taskId: string): Promise<TaskStatusResponse> => {
    if (!PIAPI_API_KEY) throw new Error('PiAPI key not configured');
    if (!taskId || taskId.trim() === '') throw new Error('Invalid task ID provided for status check');

    const endpoint = `${PIAPI_BASE_URL}/api/v1/task/${taskId}`;
    console.log(`[PiAPI] Checking status for task: ${taskId}`);
    
    try {
        const response = await fetch(endpoint, { 
            method: 'GET',
            headers: { 
                'X-API-Key': PIAPI_API_KEY,
                'Content-Type': 'application/json'
            } 
        });

        console.log(`[PiAPI] Status check response: ${response.status} ${response.statusText}`);
        
        // Parse the response data first, so we can extract error messages if needed
        let responseData;
        try {
            responseData = await response.json();
            console.log(`[PiAPI] Status data for task ${taskId}:`, responseData);
        } catch (parseError) {
            console.error(`[PiAPI] Error parsing response:`, parseError);
            throw new Error(`Failed to parse PiAPI response: ${response.statusText}`);
        }
        
        if (!response.ok) {
            // Extract error message from the response if available
            const errorMessage = responseData?.message || responseData?.error || `Status check failed: ${response.status} ${response.statusText}`;
            throw new Error(errorMessage);
        }
        
        const data = responseData.data || responseData;
        const status = (data.status || 'processing').toLowerCase();
        
        let normalizedStatus: 'pending' | 'processing' | 'completed' | 'failed';
        switch (status) {
            case 'completed': case 'success': case 'finished': case '99':
                normalizedStatus = 'completed'; break;
            case 'failed': case 'error': case 'cancelled':
                normalizedStatus = 'failed'; break;
            case 'pending': case 'queued': case 'waiting':
                normalizedStatus = 'pending'; break;
            default:
                normalizedStatus = 'processing';
        }
        
        // IMPROVED: More robust video URL extraction with detailed logging
        let videoUrl: string | undefined;
        let thumbnailUrl: string | undefined;

        // First check direct properties on the data object
        if (data.video_url) {
            videoUrl = data.video_url;
            console.log(`[PiAPI] Found video URL in data.video_url: ${videoUrl}`);
        }
        
        if (data.thumbnail_url) {
            thumbnailUrl = data.thumbnail_url;
            console.log(`[PiAPI] Found thumbnail URL in data.thumbnail_url: ${thumbnailUrl}`);
        }
        
        // Then check the works array if available
        if (!videoUrl && data.works && Array.isArray(data.works) && data.works.length > 0) {
            const work = data.works[0];
            if (work && work.resource) {
                videoUrl = work.resource.resourceWithoutWatermark || work.resource.resource;
                console.log(`[PiAPI] Found video URL in works[0].resource: ${videoUrl}`);
            }
            if (work && work.cover) {
                thumbnailUrl = work.cover.resource;
                console.log(`[PiAPI] Found thumbnail URL in works[0].cover: ${thumbnailUrl}`);
            }
        }
        
        // If we found a video URL and status is not completed, log a warning
        if (videoUrl && normalizedStatus !== 'completed') {
            console.log(`[PiAPI] Found video URL but status is ${normalizedStatus}, setting status to completed`);
            normalizedStatus = 'completed';
        }
        
        // If status is completed but no video URL, log a warning
        if (normalizedStatus === 'completed' && !videoUrl) {
            console.warn(`[PiAPI] Status is completed but no video URL found for task ${taskId}`);
        }

        let progress = 0;
        if (normalizedStatus === 'completed') progress = 100;
        else if (normalizedStatus === 'failed') progress = 0;
        else if (normalizedStatus === 'processing') progress = data.progress || 50;
        else if (normalizedStatus === 'pending') progress = 10;
        
        return {
            task_id: data.task_id || taskId,
            status: normalizedStatus,
            video_url: videoUrl,
            thumbnail_url: thumbnailUrl,
            progress: progress,
            error: data.error,
            data: data
        };
        
    } catch (error: any) {
        console.error(`[PiAPI] Error checking status for task ${taskId}:`, error);
        
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
            return {
                task_id: taskId,
                status: 'processing',
                progress: 50,
                error: 'Network error during status check'
            };
        }
        
        return {
            task_id: taskId,
            status: 'failed',
            error: error.message || 'Unknown error during status check',
            progress: 0
        };
    }
};
// =======================================================================
// UTILITY FUNCTIONS
// =======================================================================

// Convert file to base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:image/...;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

// Download video
export const downloadVideo = async (videoUrl: string, filename: string): Promise<void> => {
  try {
    const response = await fetch(videoUrl, { mode: 'cors' });
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
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

// Request notification permission
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
};

// Show browser notification
export const showVideoCompleteNotification = (videoTitle: string, onClick?: () => void) => {
  if (Notification.permission === 'granted') {
    const notification = new Notification('Your video is ready!', {
      body: `${videoTitle} has been generated successfully.`,
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: 'video-complete',
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };

    // Auto-close after 10 seconds
    setTimeout(() => {
      notification.close();
    }, 10000);
  }
};

// FIXED: Polling utility for video status
export class VideoStatusPoller {
  private intervalId: NodeJS.Timeout | null = null;
  private isPolling = false;
  private consecutiveErrors = 0;
  private maxConsecutiveErrors = 3; // Reduced from 5 to 3

  constructor(
    private taskId: string,
    private onStatusUpdate: (status: TaskStatusResponse) => void,
    private onComplete: (status: TaskStatusResponse) => void,
    private onError: (error: string) => void,
    private pollInterval: number = 10000 // Increased from 5 seconds to 10 seconds
  ) {}

  start(): void {
    if (this.isPolling) {
      console.warn('Polling already started for task:', this.taskId);
      return;
    }

    this.isPolling = true;
    this.consecutiveErrors = 0;
    console.log('Starting status polling for task:', this.taskId);

    // Initial check
    this.checkStatus();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.checkStatus();
    }, this.pollInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isPolling = false;
    this.consecutiveErrors = 0;
    console.log('Stopped status polling for task:', this.taskId);
  }

  private async checkStatus(): Promise<void> {
    try {
      console.log(`[VideoStatusPoller] Checking status for task: ${this.taskId}`);
      const status = await checkVideoStatus(this.taskId);
      
      // Reset error counter on successful check
      this.consecutiveErrors = 0;
      
      console.log(`[VideoStatusPoller] Status received:`, status);
      
      // Call the status update callback
      this.onStatusUpdate(status);

      // Check if task is complete
      if (status.status === 'completed' && status.video_url) {
        console.log(`[VideoStatusPoller] Task completed: ${this.taskId}, video URL: ${status.video_url}`);
        this.stop();
        this.onComplete(status);
      } else if (status.status === 'failed') {
        console.log(`[VideoStatusPoller] Task failed: ${this.taskId}, error: ${status.error}`);
        this.stop();
        this.onError(status.error || 'Video generation failed');
      }
    } catch (error: any) {
      this.consecutiveErrors++;
      console.error(`[VideoStatusPoller] Error checking video status (attempt ${this.consecutiveErrors}):`, error);
      
      // If we've had too many consecutive errors, stop polling and mark as failed
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.error(`[VideoStatusPoller] Too many consecutive errors for task ${this.taskId}, stopping polling`);
        this.stop();
        this.onError(`Too many consecutive errors checking status: ${error.message}`);
      }
      // Otherwise, continue polling - the error might be temporary
    }
  }

  isActive(): boolean {
    return this.isPolling;
  }
}