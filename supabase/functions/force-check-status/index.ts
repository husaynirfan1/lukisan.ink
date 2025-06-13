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
    const dbVideoId = requestBody.video_id; // Renamed to avoid confusion with PiAPI's video_id
    
    if (!dbVideoId) {
      throw new Error("Missing video_id in request body");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: videos, error: findError } = await supabase
      .from("video_generations")
      .select("id, video_id, status, progress, storage_path, video_url, thumbnail_url") // Added thumbnail_url
      .eq("id", dbVideoId)
      .limit(1);

    if (findError) throw findError;
    if (!videos || videos.length === 0) {
      return new Response(JSON.stringify({ error: `Video not found for id: ${dbVideoId}` }), { status: 404 });
    }
    const video = videos[0]; // video.video_id is the task_id for PiAPI
    
    const PIAPI_API_KEY = Deno.env.get("PIAPI_API_KEY");
    if (!PIAPI_API_KEY) {
      throw new Error("PIAPI_API_KEY secret is not set.");
    }

    // Use video.video_id (which is the task_id for PiAPI) for the API call
    const piapiResponse = await fetch(`https://api.piapi.ai/api/v1/task/${video.video_id}`, {
      headers: { "X-API-Key": PIAPI_API_KEY },
    });

    if (!piapiResponse.ok) {
      throw new Error(`PiAPI error for task_id ${video.video_id}: ${piapiResponse.status} ${piapiResponse.statusText}`);
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
    
    // Logic for handling status and video_url based on PiAPI response
    let progress = video.progress; // Default to existing progress
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (normalizedStatus === 'completed') {
      if (videoUrl) {
        console.log(`PiAPI reported status as '${status}' (normalized to 'completed') for task_id ${video.video_id} and a video URL was found.`);
        updateData.status = 'completed';
        updateData.progress = 100;
        if (videoUrl !== video.video_url) {
          updateData.video_url = videoUrl;
          console.log(`Updating video_url for task_id ${video.video_id} to: ${videoUrl}`);
        }
      } else {
        console.warn(`PiAPI reported status as '${status}' (normalized to 'completed') for task_id ${video.video_id} but NO video URL was found. Setting status to 'pending_url' and keeping existing video_url (if any) or null.`);
        normalizedStatus = 'pending_url'; // Override normalizedStatus
        updateData.status = 'pending_url';
        updateData.progress = 95; // Indicate nearly complete, pending URL
        // DO NOT set updateData.video_url here to keep the existing one
      }
    } else { // For statuses other than 'completed'
      updateData.status = normalizedStatus;
      if (normalizedStatus === "failed") {
        progress = 0; // Reset progress for failed tasks
      } else if (normalizedStatus === "processing") {
        progress = taskData.progress || video.progress || 50; // Use PiAPI progress, fallback to existing or 50
      } else if (normalizedStatus === "pending") {
        progress = video.progress || 10; // Use existing progress or 10
      }
      updateData.progress = progress;

      // If a video URL is found from PiAPI and it's different, update it
      // This handles cases where PiAPI might provide a URL even if status is not 'completed' yet
      if (videoUrl && videoUrl !== video.video_url) {
        updateData.video_url = videoUrl;
        console.log(`Found video URL for task_id ${video.video_id} (${videoUrl}) while status is '${normalizedStatus}'. Updating video_url.`);
      }
      console.log(`PiAPI reported status as '${status}' (normalized to '${normalizedStatus}') for task_id ${video.video_id}. Video URL from PiAPI: ${videoUrl ? 'Found' : 'Not found'}.`);
    }
    
    // Set progress if not already set by specific logic above
    if (updateData.progress === undefined) {
      updateData.progress = progress;
    }
    
    // Add thumbnail URL if available and different
    if (thumbnailUrl && thumbnailUrl !== video.thumbnail_url) { // Assuming video object has thumbnail_url
      updateData.thumbnail_url = thumbnailUrl;
      console.log(`Updating thumbnail_url for task_id ${video.video_id} to: ${thumbnailUrl}`);
    }
    
    // Add error message if available
    if (taskData.error) {
      updateData.error_message = taskData.error;
    }
    
    // Update the database only if there are changes
    if (Object.keys(updateData).length > 1 || updateData.updated_at) { // updated_at is always there
      const { error: updateError } = await supabase
        .from("video_generations")
        .update(updateData)
        .eq("id", video.id); // Use video.id (dbVideoId) for the DB update condition

      if (updateError) {
        console.error(`DB update error for video.id ${video.id} (task_id ${video.video_id}): ${updateError.message}`);
        throw new Error(`Failed to update video status for video.id ${video.id}: ${updateError.message}`);
      }

      // Return the processed status
      return new Response(
        JSON.stringify({
          message: "Status check complete, video updated.",
          video_id: video.id, // Database ID
          task_id: video.video_id, // PiAPI task ID
          old_status: video.status,
          new_status: updateData.status || video.status, // Use new status if updated
          old_progress: video.progress,
          new_progress: updateData.progress || video.progress, // Use new progress if updated
          video_url: updateData.video_url || video.video_url, // Reflect the final video_url state
          thumbnail_url: updateData.thumbnail_url || video.thumbnail_url, // Reflect final thumbnail_url
          updated: true
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } else {
      // No actual changes to update other than potentially updated_at, which we might not even want to send if nothing else changed.
      // For simplicity, we'll say nothing was updated if only updated_at would have changed.
      // However, the current logic always includes updated_at. If we want to be stricter,
      // we'd remove updated_at from initial updateData and only add it if other fields change.
      // For now, this path might not be hit if updated_at is always present.
      // A more robust check would be:
      // const meaningfulChanges = Object.keys(updateData).filter(k => k !== 'updated_at');
      // if (meaningfulChanges.length > 0) { ... perform update ... }
      // This is a minor optimization and current logic is fine.

      console.log(`No meaningful changes detected for video.id ${video.id} (task_id ${video.video_id}). Status from PiAPI: '${normalizedStatus}', Video URL from PiAPI: ${videoUrl ? 'Found' : 'Not found'}.`);
      return new Response(
        JSON.stringify({
          message: "Status check complete, no meaningful changes detected.",
          video_id: video.id,
          task_id: video.video_id,
          current_status: video.status,
          current_progress: video.progress,
          video_url: video.video_url,
          thumbnail_url: video.thumbnail_url, // Assuming video object has thumbnail_url
          updated: false
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }
    
  } catch (error) {
    console.error("Error in Edge Function:", error);
    // Ensure video_id (task_id) is logged if available within the error context
    // This part is tricky as `video` object might not be in scope depending on where error occurred
    // However, the initial `dbVideoId` is available.
    let errorMessage = `An unexpected error occurred. Request video_id (db): ${req.headers ? req.headers.get("X-Request-ID") || "N/A" : "N/A"}.`;
    if (error.message) {
        errorMessage = error.message;
    }
    // It's hard to reliably get video.video_id here if the error happened before video was fetched.
    // The console.error above will have more details if error has context.
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
    
  } catch (error) {
    console.error("Error in Edge Function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});