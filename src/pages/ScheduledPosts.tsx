import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Calendar as CalendarIcon, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DndContext, DragEndEvent } from "@dnd-kit/core";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek } from "date-fns";
import { DroppableDay } from "@/components/scheduled/DroppableDay";
import { TimeSlotDialog } from "@/components/scheduled/TimeSlotDialog";
import { ScheduledPost } from "@/components/scheduled/DraggablePost";

export default function ScheduledPosts() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [showTimeDialog, setShowTimeDialog] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{
    postId: string;
    targetDate: string;
    currentTime: string;
  } | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    loadScheduledPosts();
  };

  const loadScheduledPosts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("scheduled_posts")
        .select(`
          *,
          creative:creatives(id, content_type, caption, visual_url)
        `)
        .eq("user_id", user.id)
        .eq("status", "scheduled")
        .order("scheduled_time", { ascending: true });

      if (error) throw error;
      setPosts(data || []);
    } catch (error: any) {
      toast.error("Something went wrong loading your posts. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const postId = active.id as string;
    const newDate = over.id as string;
    
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const currentTime = format(new Date(post.scheduled_time), "HH:mm");
    
    setPendingDrop({
      postId,
      targetDate: newDate,
      currentTime,
    });
    setShowTimeDialog(true);
  };

  const handleTimeConfirm = async (selectedTime: string) => {
    if (!pendingDrop) return;

    const { postId, targetDate } = pendingDrop;
    const [year, month, day] = targetDate.split("-").map(Number);
    const [hours, minutes] = selectedTime.split(":").map(Number);
    const newDateTime = new Date(year, month - 1, day, hours, minutes);

    try {
      const { error } = await supabase
        .from("scheduled_posts")
        .update({ scheduled_time: newDateTime.toISOString() })
        .eq("id", postId);

      if (error) throw error;

      toast.success("Post rescheduled successfully");
      loadScheduledPosts();
    } catch (error: any) {
      toast.error("Failed to reschedule post. Please try again.");
    } finally {
      setShowTimeDialog(false);
      setPendingDrop(null);
    }
  };

  const handleTimeDialogClose = () => {
    setShowTimeDialog(false);
    setPendingDrop(null);
  };

  // Monday-first calendar
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getPostsForDay = (day: Date) => {
    return posts.filter(post => isSameDay(new Date(post.scheduled_time), day));
  };

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pt-8 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-muted-foreground">Loading calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-primary/10">
                <CalendarIcon className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Scheduled Posts</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Drag and drop to reschedule</p>
              </div>
            </div>
            <Button onClick={() => navigate("/library")} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Schedule from Library</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">

        {posts.length === 0 ? (
          <Card className="p-12 text-center">
            <CalendarIcon className="w-14 h-14 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No scheduled posts yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Save content from the Content Studio or a campaign, then schedule it to your connected platforms.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate("/content-studio")} variant="outline">
                Create Content
              </Button>
              <Button onClick={() => navigate("/library")} className="bg-gradient-primary text-white">
                Go to Library
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <Button variant="outline" onClick={previousMonth}>
                Previous
              </Button>
              <h2 className="text-xl sm:text-2xl font-semibold">
                {format(currentMonth, "MMMM yyyy")}
              </h2>
              <Button variant="outline" onClick={nextMonth}>
                Next
              </Button>
            </div>

            <DndContext onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <div key={day} className="text-center font-semibold text-xs sm:text-sm py-2">
                    {day}
                  </div>
                ))}
                {calendarDays.map((day) => (
                  <DroppableDay
                    key={day.toISOString()}
                    date={day}
                    posts={getPostsForDay(day)}
                  />
                ))}
              </div>
            </DndContext>
          </Card>
        )}
      </main>

      <TimeSlotDialog
        open={showTimeDialog}
        onClose={handleTimeDialogClose}
        onConfirm={handleTimeConfirm}
        targetDate={pendingDrop ? new Date(pendingDrop.targetDate) : null}
        currentTime={pendingDrop?.currentTime || "12:00"}
      />
    </div>
  );
}
