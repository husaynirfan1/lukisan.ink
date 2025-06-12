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
      .select("id, video_id")
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
    
    const videoUrl = taskData.works?.[0]?.resource?.resourceWithoutWatermark || taskData.works?.[0]?.resource?.resource;
    
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (videoUrl) {
      updateData.video_url = videoUrl;
    }

    if (normalizedStatus === 'completed' && videoUrl) {
        updateData.status = 'completed';
    } else if (normalizedStatus !== 'completed') {
        updateData.status = normalizedStatus;
    }
    
    if (Object.keys(updateData).length > 1) {
        const { error: updateError } = await supabase
            .from("video_generations")
            .update(updateData)
            .eq("id", video.id);
        
        if (updateError) throw updateError;
    }
    
    return new Response(
      JSON.stringify({ message: "Status check complete.", newStatus: updateData.status || 'unchanged' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
    
  } catch (error) {
    console.error("Error in Edge Function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});