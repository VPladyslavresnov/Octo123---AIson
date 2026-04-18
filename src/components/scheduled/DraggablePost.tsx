import { useDraggable } from "@dnd-kit/core";
import { format } from "date-fns";
import { Image as ImageIcon, FileText, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface ScheduledPost {
  id: string;
  scheduled_time: string;
  platforms: string[];
  status: string;
  creative?: {
    id: string;
    content_type: string;
    caption: string | null;
    visual_url: string | null;
  };
}

interface DraggablePostProps {
  post: ScheduledPost;
}

export function DraggablePost({ post }: DraggablePostProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  const getContentIcon = (type: string) => {
    switch (type) {
      case "image":
        return <ImageIcon className="w-3 h-3" />;
      case "video":
        return <Video className="w-3 h-3" />;
      default:
        return <FileText className="w-3 h-3" />;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="p-2 mb-2 bg-primary/10 rounded border border-primary/20 cursor-move hover:bg-primary/20 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="secondary" className="text-xs">
          {getContentIcon(post.creative?.content_type || "text")}
        </Badge>
        <span className="text-xs font-medium">{format(new Date(post.scheduled_time), "HH:mm")}</span>
      </div>
      <p className="text-xs line-clamp-2">{post.creative?.caption || "No caption"}</p>
      <div className="flex gap-1 mt-1 flex-wrap">
        {post.platforms.map((platform) => (
          <Badge key={platform} variant="outline" className="text-xs capitalize">
            {platform}
          </Badge>
        ))}
      </div>
    </div>
  );
}
