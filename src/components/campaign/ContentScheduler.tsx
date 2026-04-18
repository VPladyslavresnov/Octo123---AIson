import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Calendar } from "lucide-react";

interface ContentSchedulerProps {
  campaignId: string;
}

export function ContentScheduler({ campaignId }: ContentSchedulerProps) {
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScheduledPosts();
  }, [campaignId]);

  const loadScheduledPosts = async () => {
    try {
      const { data: creatives } = await supabase
        .from("creatives")
        .select(`
          *,
          scheduled_posts (*)
        `)
        .eq("campaign_id", campaignId);

      setScheduledPosts(creatives || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Loading schedule...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Content Calendar</h2>
      <Card className="p-12 text-center">
        <Calendar className="w-16 h-16 text-primary mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-3">Calendar View Coming Soon</h3>
        <p className="text-muted-foreground">
          Schedule and manage your content across all platforms
        </p>
      </Card>
    </div>
  );
}