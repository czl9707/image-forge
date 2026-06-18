// src/components/shared/ImageDropzone.tsx
import { useRef, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ImgStatus } from "@/hooks/useImageBitmap";

interface ImageDropzoneProps {
  status: ImgStatus;
  error?: string | null;
  onFile: (file: File) => void;
  className?: string;
}

export function ImageDropzone({
  status,
  error,
  onFile,
  className,
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    onFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 p-4 text-center text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50",
        status === "error" && "border-destructive/50 text-destructive",
        className,
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <Upload className="size-6" />
      {status === "loading" && <span>Decoding…</span>}
      {status === "error" && <span>{error ?? "Could not load image"}</span>}
      {(status === "idle" || status === "ready") && (
        <>
          <span>Drop an image, or click to browse</span>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => inputRef.current?.click()}
          >
            choose file
          </button>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Drop an image, or click to browse"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
