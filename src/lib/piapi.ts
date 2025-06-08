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

const PIAPI_BASE_URL = 'https://api.piapi.ai'; // IMPORTANT: This might need to be updated.
const PIAPI_API_KEY = import.meta.env.VITE_PIAPI_API_KEY;

if (!PIAPI_API_KEY) {
  console.warn('PiAPI key not found. Video generation features will be disabled.');
}

// Response from creating a task
export interface CreateTaskResponse {
  task_id: string;
}

// Response from the status check call
export interface TaskStatusResponse {
    task_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    video_url?: string;
    thumbnail_url?: string;
    progress?: number;
    error?: string;
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
    // IMPORTANT: Confirm this endpoint from the API documentation.
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

// --- Simplified Public Functions ---

// Simplified request type for Text-to-Video
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
            aspect_ratio: request.aspectRatio,
            negative_prompt: request.negativePrompt,
        }
    };

    return postToApi(payload);
};

// Simplified request type for Image-to-Video
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
};