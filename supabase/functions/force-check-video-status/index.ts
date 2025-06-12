// Follow this setup guide to integrate the Deno runtime into your application:
// https://deno.land/manual/examples/deploy_node_app

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    // Get the video ID from the request
    const url = new URL(req.url);
    const videoId = url.searchParams.get("video_id");
    
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "Missing video_id parameter" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the video from the database
    const { data: videos, error: findError } = await supabase
      .from("video_generations")
      .select("*")
      .eq("id", videoId)
      .limit(1);

    if (findError || !videos || videos.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "Video not found in database",
          details: findError || "No matching video found"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    const video = videos[0];
    
    // Get the PiAPI key from environment variables
    const PIAPI_API_KEY = Deno.env.get("PIAPI_API_KEY");
    if (!PIAPI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "PiAPI key not configured" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // Check the status of the task
    const response = await fetch(`https://api.piapi.ai/api/v1/task/${video.video_id}`, {
      method: "GET",
      headers: {
        "X-API-Key": PIAPI_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Update the video status to failed if the task doesn't exist
      if (response.status === 404) {
        await supabase
          .from("video_generations")
          .update({ 
            status: "failed",
            error_message: "Task not found on PiAPI server",
            updated_at: new Date().toISOString()
          })
          .eq("id", video.id);
      }
      
      return new Response(
        JSON.stringify({ 
          error: `PiAPI error: ${response.status} ${response.statusText}`,
          details: errorText
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: response.status,
        }
      );
    }

    // Parse the response
    const data = await response.json();
    
    // Process the PiAPI response
    const taskData = data.data || data;
    const status = taskData.status || "processing";
    
    // Normalize status values
    let normalizedStatus;
    switch (status.toLowerCase()) {
      case "completed":
      case "success":
      case "finished":
      case "99": // PiAPI uses numeric status codes in some responses
        normalizedStatus = "completed";
        break;
      case "failed":
      case "error":
      case "cancelled":
        normalizedStatus = "failed";
        break;
      case "pending":
      case "queued":
      case "waiting":
        normalizedStatus = "pending";
        break;
      default:
        normalizedStatus = "processing";
    }
    
    // Extract video URL from the response
    let videoUrl;
    let thumbnailUrl;
    
    if (taskData.works && taskData.works.length > 0) {
      const work = taskData.works[0];
      videoUrl = work.resource?.resourceWithoutWatermark || work.resource?.resource;
      thumbnailUrl = work.cover?.resource;
      
      console.log("Found video URL in works:", videoUrl);
      console.log("Found thumbnail URL in works:", thumbnailUrl);
    }
    
    // Calculate progress
    let progress = 0;
    if (normalizedStatus === "completed") {
      progress = 100;
    } else if (normalizedStatus === "failed") {
      progress = 0;
    } else if (normalizedStatus === "processing") {
      progress = 50;
    } else if (normalizedStatus === "pending") {
      progress = 10;
    }
    
    // Update the video in the database
    const updateData: any = {
      status: normalizedStatus,
      progress: progress,
      updated_at: new Date().toISOString()
    };
    
    if (videoUrl) {
      updateData.video_url = videoUrl;
    }
    
    if (thumbnailUrl) {
      updateData.thumbnail_url = thumbnailUrl;
    }
    
    if (taskData.error) {
      updateData.error_message = taskData.error;
    }
    
    const { error: updateError } = await supabase
      .from("video_generations")
      .update(updateData)
      .eq("id", video.id);
    
    if (updateError) {
      return new Response(
        JSON.stringify({ 
          error: "Failed to update video status",
          details: updateError
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }
    
    // Return the processed status
    return new Response(
      JSON.stringify({
        video_id: video.id,
        task_id: video.video_id,
        status: normalizedStatus,
        progress: progress,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        updated: true,
        message: "Status updated successfully"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});