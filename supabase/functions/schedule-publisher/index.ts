import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Checking for scheduled posts to publish...");

    // Get all posts scheduled for now or earlier
    const { data: scheduledPosts, error: fetchError } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_time", new Date().toISOString());

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${scheduledPosts?.length || 0} posts to publish`);

    if (!scheduledPosts || scheduledPosts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No posts to publish", count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process each scheduled post
    const results = await Promise.all(
      scheduledPosts.map(async (post) => {
        try {
          const platformResults = await Promise.all(
            post.platforms.map(async (platform: string) => {
              console.log(`Publishing post ${post.id} to ${platform}`);
              
              try {
                const { data, error } = await supabase.functions.invoke(`${platform}-post`, {
                  body: { scheduledPostId: post.id }
                });

                if (error) {
                  console.error(`Error publishing post ${post.id} to ${platform}:`, error);
                  return { platform, success: false, error: error.message };
                }

                return { platform, success: true };
              } catch (error: any) {
                console.error(`Error invoking ${platform}-post:`, error);
                return { platform, success: false, error: error.message };
              }
            })
          );

          const allSucceeded = platformResults.every(r => r.success);
          const anySucceeded = platformResults.some(r => r.success);

          if (allSucceeded) {
            await supabase
              .from("scheduled_posts")
              .update({
                status: "published",
                published_at: new Date().toISOString(),
              })
              .eq("id", post.id);
            
            return { id: post.id, success: true, platforms: platformResults };
          } else if (anySucceeded) {
            await supabase
              .from("scheduled_posts")
              .update({
                status: "partial",
                error_message: JSON.stringify(platformResults.filter(r => !r.success)),
              })
              .eq("id", post.id);
            
            return { id: post.id, success: false, error: "Partial success", platforms: platformResults };
          } else {
            await supabase
              .from("scheduled_posts")
              .update({
                status: "failed",
                error_message: JSON.stringify(platformResults),
              })
              .eq("id", post.id);
            
            return { id: post.id, success: false, error: "All platforms failed", platforms: platformResults };
          }
        } catch (error: any) {
          console.error(`Error processing post ${post.id}:`, error);
          return { id: post.id, success: false, error: error.message };
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    console.log(`Published ${successCount} out of ${results.length} posts`);

    return new Response(
      JSON.stringify({ 
        message: "Publishing completed", 
        total: results.length,
        successful: successCount,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Error in schedule-publisher:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
