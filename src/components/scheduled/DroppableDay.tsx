import { useDroppable } from "@dnd-kit/core";
import { format, isSameDay } from "date-fns";
import { DraggablePost, ScheduledPost } from "./DraggablePost";

interface DroppableDayProps {
  date: Date;
  posts: ScheduledPost[];
}

export function DroppableDay({ date, posts }: DroppableDayProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: format(date, "yyyy-MM-dd"),
  });

  const isToday = isSameDay(date, new Date());
  const isPast = date < new Date() && !isToday;

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[120px] p-2 border rounded-lg transition-colors ${
        isOver ? "bg-primary/10 border-primary" : "bg-background border-border"
      } ${isToday ? "ring-2 ring-primary" : ""} ${isPast ? "opacity-50" : ""}`}
    >
      <div className="font-semibold text-sm mb-2">{format(date, "d")}</div>
      {posts.map((post) => (
        <DraggablePost key={post.id} post={post} />
      ))}
    </div>
  );
}
