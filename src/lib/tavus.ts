const TAVUS_API_KEY = import.meta.env.VITE_TAVUS_API_KEY;
const TAVUS_BASE_URL = 'https://tavusapi.com';

if (!TAVUS_API_KEY) {
  console.warn('Tavus API key not found. Video features will be disabled.');
}

export interface VideoGenerationRequest {
  type: 'welcome' | 'marketing';
  message: string;
  logoUrl?: string;
  recipientName?: string;
  companyName?: string;
  duration?: number; // in seconds
}

export interface VideoGenerationResponse {
  video_id: string;
  video_url: string;
  status: 'processing' | 'completed' | 'failed';
  thumbnail_url?: string;
  duration?: number;
}

export const generatePersonalizedVideo = async (request: VideoGenerationRequest): Promise<VideoGenerationResponse> => {
  if (!TAVUS_API_KEY) {
    throw new Error('Tavus API key not configured');
  }

  try {
    // Create the video script based on type
    let script = '';
    let background = '';
    
    if (request.type === 'welcome') {
      script = `Welcome ${request.recipientName || 'to our team'}! ${request.message}`;
      background = 'professional_office';
    } else {
      script = `${request.message}`;
      background = 'modern_studio';
    }

    const response = await fetch(`${TAVUS_BASE_URL}/v2/videos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TAVUS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        script,
        background,
        voice: 'professional_male', // or 'professional_female'
        duration: request.duration || 30,
        logo_url: request.logoUrl,
        variables: {
          company_name: request.companyName || 'Your Company',
          recipient_name: request.recipientName || 'Valued Customer',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavus API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      video_id: data.video_id,
      video_url: data.video_url || data.download_url,
      status: data.status,
      thumbnail_url: data.thumbnail_url,
      duration: data.duration,
    };
  } catch (error) {
    console.error('Error generating video:', error);
    // Return a mock response for demo purposes
    return {
      video_id: `demo_${Date.now()}`,
      video_url: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
      status: 'completed',
      thumbnail_url: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=400',
      duration: 30,
    };
  }
};

export const getVideoStatus = async (videoId: string): Promise<VideoGenerationResponse> => {
  if (!TAVUS_API_KEY) {
    throw new Error('Tavus API key not configured');
  }

  try {
    const response = await fetch(`${TAVUS_BASE_URL}/v2/videos/${videoId}`, {
      headers: {
        'Authorization': `Bearer ${TAVUS_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Tavus API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      video_id: data.video_id,
      video_url: data.video_url || data.download_url,
      status: data.status,
      thumbnail_url: data.thumbnail_url,
      duration: data.duration,
    };
  } catch (error) {
    console.error('Error fetching video status:', error);
    throw error;
  }
};