// src/hooks/useImageBitmap.ts
import { useCallback, useState } from "react";

export type ImgStatus = "idle" | "loading" | "ready" | "error";

export interface UseImageBitmap {
  bitmap: ImageBitmap | null;
  name: string | null;
  status: ImgStatus;
  error: string | null;
  load: (file: File) => Promise<void>;
  reset: () => void;
}

export function useImageBitmap(): UseImageBitmap {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<ImgStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (file: File) => {
    setStatus("loading");
    setError(null);
    setName(file.name);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Not an image file");
      }
      const bmp = await createImageBitmap(file);
      setBitmap(bmp);
      setStatus("ready");
    } catch (e) {
      setBitmap(null);
      setName(null);
      setError(e instanceof Error ? e.message : "Failed to load image");
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    setBitmap(null);
    setName(null);
    setStatus("idle");
    setError(null);
  }, []);

  return { bitmap, name, status, error, load, reset };
}
