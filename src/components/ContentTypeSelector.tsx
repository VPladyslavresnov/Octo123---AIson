import { FileText, Image, Video } from "lucide-react";
import { cn } from "@/lib/utils";

export type ContentType = "text" | "image" | "video";

interface ContentTypeSelectorProps {
  selectedType: ContentType;
  onSelectType: (type: ContentType) => void;
}

const contentTypes = [
  { id: "text" as ContentType, label: "Text", icon: FileText },
  { id: "image" as ContentType, label: "Image", icon: Image },
  { id: "video" as ContentType, label: "Video", icon: Video },
];

export function ContentTypeSelector({ selectedType, onSelectType }: ContentTypeSelectorProps) {
  return (
    <div className="flex gap-3 justify-center flex-wrap">
      {contentTypes.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onSelectType(id)}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300",
            "hover:scale-105 hover:shadow-medium",
            selectedType === id
              ? "bg-gradient-primary text-primary-foreground shadow-strong"
              : "bg-card border-2 border-border text-foreground hover:border-primary/50"
          )}
        >
          <Icon className="w-5 h-5" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
