// This is your new server-side API endpoint.
// File location: /src/app/api/process-video/route.ts

import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

// These environment variables must be set in your Vercel/deployment environment.
// They should NOT have the NEXT_PUBLIC_ prefix, as they are for server-side use only.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

// Initialize the Supabase client with the service_role key for admin privileges on the server.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// The handler function for POST requests to this endpoint.
export async function POST(req: NextRequest) {
  try {
    const { videoId, piapiVideoUrl, userId, taskId } = await req.json();

    // 1. Validate input from the frontend request
    if (!videoId || !piapiVideoUrl || !userId || !taskId) {
      return NextResponse.json(
        { error: 'Missing required fields: videoId, piapiVideoUrl, userId, taskId' },
        { status: 400 }
      );
    }

    // 2. Download the video from the PiAPI URL (server-to-server, no CORS issue)
    console.log(`[API Route] Downloading video from: ${piapiVideoUrl}`);
    const videoResponse = await fetch(piapiVideoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video from PiAPI: ${videoResponse.statusText}`);
    }
    const videoBlob = await videoResponse.blob();
    console.log(`[API Route] Video downloaded, size: ${videoBlob.size} bytes`);

    // 3. Upload the video to your Supabase Storage bucket
    const timestamp = Date.now();
    const storagePath = `videos/${userId}/${timestamp}-${taskId}.mp4`;
    console.log(`[API Route] Uploading to Supabase Storage at: ${storagePath}`);
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from('generated-videos')
      .upload(storagePath, videoBlob, {
        contentType: 'video/mp4',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Supabase upload failed: ${uploadError.message}`);
    }

    // 4. Get the public URL for the newly uploaded video
    const { data: urlData } = supabaseAdmin.storage
      .from('generated-videos')
      .getPublicUrl(storagePath);
      
    if (!urlData.publicUrl) {
      throw new Error('Failed to get public URL from Supabase.');
    }
    const finalSupabaseUrl = urlData.publicUrl;
    console.log(`[API Route] Final Supabase URL: ${finalSupabaseUrl}`);

    // 5. Update your database record with the final URL and 'completed' status
    const { error: dbError } = await supabaseAdmin
      .from('video_generations')
      .update({
        video_url: finalSupabaseUrl,
        status: 'completed',
        storage_path: storagePath,
      })
      .eq('id', videoId);

    if (dbError) {
      throw new Error(`Database update failed: ${dbError.message}`);
    }

    console.log(`[API Route] Successfully processed video ${videoId}`);
    return NextResponse.json({ 
      success: true, 
      message: 'Video processed successfully', 
      finalUrl: finalSupabaseUrl 
    });

  } catch (error: any) {
    console.error('[API Route] Error processing video:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
