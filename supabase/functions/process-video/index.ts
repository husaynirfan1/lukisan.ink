import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Parse request body
    const { videoId, piapiVideoUrl, userId, taskId } = await req.json()

    if (!videoId || !piapiVideoUrl || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Processing video ${videoId} for user ${userId}`)

    // Download video from PiAPI
    console.log('Downloading video from PiAPI:', piapiVideoUrl)
    const videoResponse = await fetch(piapiVideoUrl)
    
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.statusText}`)
    }

    const videoBlob = await videoResponse.blob()
    console.log(`Downloaded video blob, size: ${videoBlob.size} bytes`)

    // Generate unique filename for storage
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 15)
    const fileName = `video-${timestamp}-${randomId}.mp4`
    const storagePath = `videos/${userId}/${fileName}`

    // Upload to Supabase Storage
    console.log('Uploading to Supabase Storage:', storagePath)
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('generated-videos')
      .upload(storagePath, videoBlob, {
        contentType: 'video/mp4',
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      throw new Error(`Failed to upload video: ${uploadError.message}`)
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('generated-videos')
      .getPublicUrl(storagePath)

    if (!urlData.publicUrl) {
      throw new Error('Failed to get public URL')
    }

    console.log('Video uploaded successfully, public URL:', urlData.publicUrl)

    // Update database record
    const { error: updateError } = await supabaseAdmin
      .from('video_generations')
      .update({
        video_url: urlData.publicUrl,
        storage_path: storagePath,
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('video_id', videoId)
      .eq('user_id', userId)

    if (updateError) {
      console.error('Database update error:', updateError)
      
      // Clean up uploaded file if database update fails
      await supabaseAdmin.storage
        .from('generated-videos')
        .remove([storagePath])
      
      throw new Error(`Failed to update database: ${updateError.message}`)
    }

    console.log(`Successfully processed video ${videoId}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        videoUrl: urlData.publicUrl,
        storagePath: storagePath
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error processing video:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An unexpected error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})