import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const requestBody = await req.json();
    const videoId = requestBody.video_id;
    
    if (!videoId) {
      throw new Error("Missing video_id in request body");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: videos, error: findError } = await supabase
      .from("video_generations")
      .select("id, video_id, status, progress, storage_path, video_url")
      .eq("id", videoId)
      .limit(1);

    if (findError) throw findError;
    if (!videos || videos.length === 0) {
      return new Response(JSON.stringify({ error: "Video not found" }), { status: 404 });
    }
    const video = videos[0];
    
    const PIAPI_API_KEY = Deno.env.get("PIAPI_API_KEY");
    if (!PIAPI_API_KEY) {
      throw new Error("PIAPI_API_KEY secret is not set.");
    }

    const piapiResponse = await fetch(`https://api.piapi.ai/api/v1/task/${video.video_id}`, {
      headers: { "X-API-Key": PIAPI_API_KEY },
    });

    if (!piapiResponse.ok) {
      throw new Error(`PiAPI error: ${piapiResponse.status} ${piapiResponse.statusText}`);
    }

    const data = await piapiResponse.json();
    const taskData = data.data || data;
    const status = (taskData.status || "processing").toLowerCase();
    
    let normalizedStatus;
    switch (status) {
      case "completed": case "success": case "finished": case "99":
        normalizedStatus = "completed"; break;
      case "failed": case "error": case "cancelled":
        normalizedStatus = "failed"; break;
      case "pending": case "queued": case "waiting":
        normalizedStatus = "pending"; break;
      default:
        normalizedStatus = "processing";
    }
    
    // IMPROVED: More robust video URL extraction
    let videoUrl;
    let thumbnailUrl;
    
    // First check direct properties on the data object
    if (taskData.video_url) {
      videoUrl = taskData.video_url;
      console.log(`Found video URL in data.video_url: ${videoUrl}`);
    }
    
    if (taskData.thumbnail_url) {
      thumbnailUrl = taskData.thumbnail_url;
      console.log(`Found thumbnail URL in data.thumbnail_url: ${thumbnailUrl}`);
    }
    
    // Then check the works array if available
    if (!videoUrl && taskData.works && Array.isArray(taskData.works) && taskData.works.length > 0) {
      const work = taskData.works[0];
      if (work && work.resource) {
        videoUrl = work.resource.resourceWithoutWatermark || work.resource.resource;
        console.log(`Found video URL in works[0].resource: ${videoUrl}`);
      }
      if (work && work.cover) {
        thumbnailUrl = work.cover.resource;
        console.log(`Found thumbnail URL in works[0].cover: ${thumbnailUrl}`);
      }
    }
    
    // If we found a video URL and status is not completed, update status
    if (videoUrl && normalizedStatus !== 'completed') {
      console.log(`Found video URL but status is ${normalizedStatus}, setting status to completed`);
      normalizedStatus = 'completed';
    }
    
    // Calculate progress
    let progress = 0;
    if (normalizedStatus === "completed") {
      progress = 100;
    } else if (normalizedStatus === "failed") {
      progress = 0;
    } else if (normalizedStatus === "processing") {
      progress = taskData.progress || 50;
    } else if (normalizedStatus === "pending") {
      progress = 10;
    }
    
    // Prepare update data
    const updateData: any = {
      status: normalizedStatus,
      progress: progress,
      updated_at: new Date().toISOString()
    };
    
    // Only update video_url if we found one and it's different from the current one
    if (videoUrl && videoUrl !== video.video_url) {
      updateData.video_url = videoUrl;
      console.log(`Updating video URL to: ${videoUrl}`);
    }
    
    // Add thumbnail URL if available
    if (thumbnailUrl) {
      updateData.thumbnail_url = thumbnailUrl;
    }
    
    // Add error message if available
    if (taskData.error) {
      updateData.error_message = taskData.error;
    }
    
    // Update the database
    const { error: updateError } = await supabase
      .from("video_generations")
      .update(updateData)
      .eq("id", video.id);
    
    if (updateError) {
      throw new Error(`Failed to update video status: ${updateError.message}`);
    }
    
    // Return the processed status
    return new Response(
      JSON.stringify({
        message: "Status check complete",
        video_id: video.id,
        task_id: video.video_id,
        old_status: video.status,
        new_status: updateData.status,
        old_progress: video.progress,
        new_progress: updateData.progress,
        video_url: videoUrl || video.video_url,
        thumbnail_url: thumbnailUrl,
        updated: true
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
    
  } catch (error) {
    console.error("Error in Edge Function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});