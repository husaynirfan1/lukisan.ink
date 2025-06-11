// This is a new server-side file, e.g., /pages/api/process-video.ts
// It requires the Supabase Admin client for secure server-side operations.
// npm install @supabase/supabase-js

import { createClient } from '@supabase/supabase-js';

// Use environment variables for security.
// Ensure these are set in your backend environment, NOT exposed to the browser.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

// Create a Supabase client with the service_role key for admin privileges
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { videoId, piapiVideoUrl, userId, taskId } = req.body;

    // 1. Validate input
    if (!videoId || !piapiVideoUrl || !userId || !taskId) {
      return res.status(400).json({ error: 'Missing required fields: videoId, piapiVideoUrl, userId, taskId' });
    }

    // 2. Download the video from the PiAPI URL (server-to-server, no CORS issue)
    console.log(`[Backend] Downloading video from: ${piapiVideoUrl}`);
    const videoResponse = await fetch(piapiVideoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video from PiAPI: ${videoResponse.statusText}`);
    }
    const videoBlob = await videoResponse.blob();
    console.log(`[Backend] Video downloaded, size: ${videoBlob.size} bytes`);

    // 3. Upload the video to your Supabase Storage bucket
    const timestamp = Date.now();
    const storagePath = `videos/${userId}/${timestamp}-${taskId}.mp4`;
    console.log(`[Backend] Uploading to Supabase Storage at: ${storagePath}`);
    
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
    console.log(`[Backend] Final Supabase URL: ${finalSupabaseUrl}`);

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

    console.log(`[Backend] Successfully processed video ${videoId}`);
    return res.status(200).json({ success: true, message: 'Video processed successfully', finalUrl: finalSupabaseUrl });

  } catch (error) {
    console.error('[Backend] Error processing video:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
