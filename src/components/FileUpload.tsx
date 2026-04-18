import { useCallback, useState } from "react";
import { Upload, X, FileImage, FileVideo } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContentType } from "./ContentTypeSelector";

interface FileUploadProps {
  contentType: ContentType;
  onFileSelect: (file: File | null) => void;
}

export function FileUpload({ contentType, onFileSelect }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const acceptedTypes = contentType === "image" 
    ? "image/*" 
    : contentType === "video" 
    ? "video/*" 
    : "";

  const handleFile = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    onFileSelect(selectedFile);

    // Create preview
    if (selectedFile.type.startsWith("image/") || selectedFile.type.startsWith("video/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  }, [onFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFile(selectedFile);
  }, [handleFile]);

  const removeFile = useCallback(() => {
    setFile(null);
    setPreview(null);
    onFileSelect(null);
  }, [onFileSelect]);

  if (contentType === "text") return null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-accent/50 border border-primary/20 rounded-lg p-3 mb-4">
        <p className="text-sm text-muted-foreground text-center">
          <span className="font-medium text-foreground">Optional:</span> Upload a file as reference for AI enhancement
        </p>
      </div>
      
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 transition-all duration-300",
          isDragging 
            ? "border-primary bg-primary-light scale-105" 
            : "border-border bg-card hover:border-primary/50 hover:bg-accent"
        )}
      >
        <input
          type="file"
          accept={acceptedTypes}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <div className="flex flex-col items-center gap-3 pointer-events-none">
          <div className={cn(
            "p-4 rounded-full transition-colors",
            isDragging ? "bg-primary/20" : "bg-accent"
          )}>
            {contentType === "image" ? (
              <FileImage className="w-8 h-8 text-primary" />
            ) : (
              <FileVideo className="w-8 h-8 text-primary" />
            )}
          </div>
          
          <div className="text-center">
            <p className="font-medium text-foreground mb-1">
              Drop your {contentType} here or click to browse
            </p>
            <p className="text-sm text-muted-foreground">
              {contentType === "image" ? "PNG, JPG, GIF up to 10MB" : "MP4, MOV, AVI up to 50MB"}
            </p>
            <p className="text-xs text-primary mt-2 font-medium">
              Use as reference only
            </p>
          </div>
        </div>
      </div>

      {file && (
        <div className="bg-card rounded-xl p-4 shadow-soft animate-scale-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {contentType === "image" ? (
                <FileImage className="w-5 h-5 text-primary" />
              ) : (
                <FileVideo className="w-5 h-5 text-primary" />
              )}
              <div>
                <p className="font-medium text-sm text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <button
              onClick={removeFile}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {preview && (
            <div className="rounded-lg overflow-hidden bg-muted">
              {contentType === "image" ? (
                <img 
                  src={preview} 
                  alt="Preview" 
                  className="w-full h-48 object-cover"
                />
              ) : (
                <video 
                  src={preview} 
                  controls 
                  className="w-full h-48"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
