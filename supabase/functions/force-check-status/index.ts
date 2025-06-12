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

    // Step 1: Fetch current video record including status, progress, and storage_path
    const { data: videos, error: findError } = await supabase
      .from("video_generations")
      .select("id, video_id, status, progress, storage_path") // Ensure all required fields are selected
      .eq("id", videoId)
      .limit(1);

    if (findError) throw findError;
    if (!videos || videos.length === 0) {
      return new Response(JSON.stringify({ error: "Video not found" }), { status: 404 });
    }
    const video = videos[0]; // This is the current state from DB
    
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
    
    // videoUrl is not used for updating the database record's video_url field.
    // const videoUrl = taskData.works?.[0]?.resource?.resourceWithoutWatermark || taskData.works?.[0]?.resource?.resource;
    
    const potentialUpdates: any = {};

    // Step 2 & 3: Determine new status based on PiAPI and storage_path
    if (normalizedStatus === 'completed') {
      if (!video.storage_path || video.storage_path.trim() === '') {
        potentialUpdates.status = 'processing'; // Downgrade to processing if PiAPI says completed but no storage_path
      } else {
        potentialUpdates.status = 'completed'; // Confirm completed only if storage_path is present
      }
    } else {
      // For 'pending', 'processing', 'failed'
      potentialUpdates.status = normalizedStatus;
    }

    // Step 5: Add progress if available from PiAPI response
    if (typeof taskData.progress === 'number') {
      potentialUpdates.progress = taskData.progress;
    }
    // video_url is intentionally not updated.

    // Step 6: Conditional database update
    let needsUpdate = false;
    if (potentialUpdates.status !== video.status) {
      needsUpdate = true;
    }
    if (typeof potentialUpdates.progress === 'number' && potentialUpdates.progress !== video.progress) {
      // Also consider if video.progress was null/undefined and taskData.progress is now a number
      if (video.progress === null || video.progress === undefined || potentialUpdates.progress !== video.progress) {
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      const finalUpdateData = { ...potentialUpdates, updated_at: new Date().toISOString() };
      const { error: updateError } = await supabase
          .from("video_generations")
          .update(finalUpdateData)
          .eq("id", video.id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({
          message: "Status check processed. Record updated.",
          newStatus: finalUpdateData.status,
          oldStatus: video.status,
          newProgress: finalUpdateData.progress,
          oldProgress: video.progress
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    } else {
      return new Response(
        JSON.stringify({
          message: "Status check processed. No changes needed.",
          currentStatus: video.status,
          currentProgress: video.progress
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }
    
  } catch (error) {
    console.error("Error in Edge Function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});