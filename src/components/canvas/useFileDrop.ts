// src/components/canvas/useFileDrop.ts
import { useState, type DragEvent, type RefObject } from "react";
import type Konva from "konva";

export interface FileDropHandlers {
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDragLeave: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
}

/**
 * Image-file drag-and-drop over a Konva stage. The generic mechanics — stage
 * bounding-rect lookup, image-type gating, `preventDefault`, and re-render
 * throttling on drag-over — live here. The tool supplies two tool-specific
 * callbacks:
 *   - `resolve`: map a cursor position (in canvas-local px, plus the canvas's
 *     w/h) to a target of type T, or null when over no valid target.
 *   - `onDrop`: receive the dropped file + the resolved target.
 *
 * Returns `dropProps` to spread on the container element, `hoveredTarget` for
 * the canvas to draw its own highlight, and `reset` to clear it.
 */
export function useFileDrop<T>(opts: {
  stageRef: RefObject<Konva.Stage | null>;
  resolve: (x: number, y: number, w: number, h: number) => T | null;
  onDrop: (file: File, target: T) => void;
}): {
  dropProps: FileDropHandlers;
  hoveredTarget: T | null;
  reset: () => void;
} {
  const [hoveredTarget, setHoveredTarget] = useState<T | null>(null);

  // Map a screen cursor to a target. The stage canvas is centered in its
  // container, so we map against the canvas's own bounding rect; `resolve`
  // owns the tool-specific "which region is this" logic.
  const clientToTarget = (clientX: number, clientY: number): T | null => {
    const rect = opts.stageRef.current?.container().getBoundingClientRect();
    if (!rect) return null;
    return opts.resolve(
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height,
    );
  };

  // preventDefault so the browser allows the drop; only update state when the
  // target actually changes to avoid re-render churn on every mousemove.
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const next = clientToTarget(e.clientX, e.clientY);
    setHoveredTarget((prev) => (prev === next ? prev : next));
  };

  const onDragLeave = () => setHoveredTarget(null);

  // Reject non-images before preventDefault (so the browser keeps its default
  // for, e.g., text drops). NOTE: onDragLeave clears unconditionally, which can
  // flicker when crossing internal element boundaries — a drag-counter is the
  // documented fallback if it proves noticeable.
  const onDrop = (e: DragEvent<HTMLElement>) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    const target = clientToTarget(e.clientX, e.clientY);
    if (target !== null) opts.onDrop(file, target);
    setHoveredTarget(null);
  };

  return {
    dropProps: { onDragOver, onDragLeave, onDrop },
    hoveredTarget,
    reset: () => setHoveredTarget(null),
  };
}
