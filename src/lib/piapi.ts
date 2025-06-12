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

// Response from the status check call - Updated based on actual PiAPI response structure
export interface TaskStatusResponse {
    task_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    video_url?: string;
    thumbnail_url?: string;
    progress?: number;
    error?: string;
    output?: {
        video_url?: string;
        thumbnail_url?: string;
        error?: string;
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

    // Validate the response structure based on PiAPI docs
    if (!responseData) {
        throw new Error('Empty response from PiAPI service');
    }

    // Extract task_id from nested data object if present
    const taskId = responseData.data?.task_id || responseData.task_id;
    
    // Check for task_id in the response - it should be present according to PiAPI docs
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
 * Check the status of a video generation task
 * This function polls the PiAPI status endpoint to get real-time updates
 */
export const checkVideoStatus = async (taskId: string): Promise<TaskStatusResponse> => {
    if (!PIAPI_API_KEY) throw new Error('PiAPI key not configured');
    
    if (!taskId || taskId.trim() === '') {
        throw new Error('Invalid task ID provided for status check');
    }

    const endpoint = `${PIAPI_BASE_URL}/api/v1/task/${taskId}`;
    console.log(`[PiAPI] Checking status for task: ${taskId}`);
    
    try {
        const response = await fetch(endpoint, { 
            method: 'GET',
            headers: { 
                'x-api-key': PIAPI_API_KEY,
                'Content-Type': 'application/json'
            } 
        });

        console.log(`[PiAPI] Status check response: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[PiAPI] Status check failed for task ${taskId}:`, errorText);
            
            // Handle specific error cases
            if (response.status === 400) {
                return {
                    task_id: taskId,
                    status: 'failed',
                    error: 'Task not found or expired',
                    progress: 0
                };
            } else if (response.status === 404) {
                return {
                    task_id: taskId,
                    status: 'failed',
                    error: 'Task not found',
                    progress: 0
                };
            } else if (response.status === 429) {
                return {
                    task_id: taskId,
                    status: 'processing',
                    progress: 50,
                    error: 'Rate limited, retrying...'
                };
            }
            
            throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[PiAPI] Raw status data for task ${taskId}:`, JSON.stringify(data, null, 2));
        
        // Parse the complex PiAPI response structure according to documentation
        const responseData = data.data || data;
        const apiStatus = responseData.status;
        const works = responseData.works || [];
        
        // Normalize status values based on PiAPI documentation
        let normalizedStatus: 'pending' | 'processing' | 'completed' | 'failed';
        let progress = 0;
        let videoUrl: string | undefined;
        let thumbnailUrl: string | undefined;
        let errorMessage: string | undefined;
        
        // Map PiAPI status to our normalized status
        switch (apiStatus?.toLowerCase()) {
            case 'completed':
                normalizedStatus = 'completed';
                progress = 100;
                break;
            case 'failed':
            case 'error':
                normalizedStatus = 'failed';
                progress = 0;
                break;
            case 'pending':
            case 'queued':
                normalizedStatus = 'pending';
                progress = 10;
                break;
            case 'processing':
            case 'running':
            default:
                normalizedStatus = 'processing';
                progress = 50;
        }
        
        // Extract video URL from works array if completed
        if (normalizedStatus === 'completed' && works.length > 0) {
            const work = works[0];
            if (work.resource) {
                // Use resourceWithoutWatermark if available, otherwise use resource
                videoUrl = work.resource.resourceWithoutWatermark || work.resource.resource;
                
                // Extract thumbnail from cover if available
                if (work.cover && work.cover.resource) {
                    thumbnailUrl = work.cover.resource;
                }
                
                console.log(`[PiAPI] Extracted video URL: ${videoUrl}`);
                console.log(`[PiAPI] Extracted thumbnail URL: ${thumbnailUrl}`);
            }
        }
        
        // Handle failed status
        if (normalizedStatus === 'failed') {
            errorMessage = 'Video generation failed';
            
            // Try to extract more specific error information
            if (works.length > 0 && works[0].status !== 99) {
                errorMessage = `Video generation failed with status: ${works[0].status}`;
            }
        }
        
        const result: TaskStatusResponse = {
            task_id: responseData.task_id || taskId,
            status: normalizedStatus,
            video_url: videoUrl,
            thumbnail_url: thumbnailUrl,
            progress: progress,
            error: errorMessage
        };
        
        console.log(`[PiAPI] Processed status result:`, result);
        return result;
        
    } catch (error: any) {
        console.error(`[PiAPI] Error checking status for task ${taskId}:`, error);
        
        // If it's a network error, treat as still processing
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
            return {
                task_id: taskId,
                status: 'processing',
                progress: 50,
                error: 'Network error during status check'
            };
        }
        
        // For other errors, mark as failed
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

// Polling utility for video status
export class VideoStatusPoller {
  private intervalId: NodeJS.Timeout | null = null;
  private isPolling = false;
  private consecutiveErrors = 0;
  private maxConsecutiveErrors = 5;

  constructor(
    private taskId: string,
    private onStatusUpdate: (status: TaskStatusResponse) => void,
    private onComplete: (status: TaskStatusResponse) => void,
    private onError: (error: string) => void,
    private pollInterval: number = 5000 // 5 seconds default
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
      const status = await checkVideoStatus(this.taskId);
      
      // Reset error counter on successful check
      this.consecutiveErrors = 0;
      
      // Call the status update callback
      this.onStatusUpdate(status);

      // Check if task is complete
      if (status.status === 'completed') {
        this.stop();
        this.onComplete(status);
      } else if (status.status === 'failed') {
        this.stop();
        this.onError(status.error || 'Video generation failed');
      }
    } catch (error: any) {
      this.consecutiveErrors++;
      console.error(`Error checking video status (attempt ${this.consecutiveErrors}):`, error);
      
      // If we've had too many consecutive errors, stop polling and mark as failed
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
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