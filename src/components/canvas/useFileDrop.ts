// src/components/canvas/useFileDrop.ts
import { useRef, useState, type DragEvent, type RefObject } from "react";
import type Konva from "konva";

export interface FileDropHandlers {
  onDragEnter: (e: DragEvent<HTMLElement>) => void;
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

  // HTML drag events fire `dragenter`/`dragleave` for *every* descendant the
  // pointer crosses (e.g. the Stage's <canvas>, its container) — not just when
  // entering/leaving the drop zone as a whole. A counter balances enter/leave
  // pairs across nesting; we only clear the highlight once the pointer has
  // truly left the container. This stops the rapid blink the naive
  // `onDragLeave → null` caused. `true` marks a drag in progress so `onDrop`
  // (which may run without a final dragleave) can reset both.
  const dragDepth = useRef(0);

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

  const onDragEnter = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    dragDepth.current += 1;
  };

  // Balanced against dragenter: decrement on each nested leave and only clear
  // once the pointer has fully exited the container.
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setHoveredTarget(null);
  };

  // Reject non-images before preventDefault (so the browser keeps its default
  // for, e.g., text drops).
  const onDrop = (e: DragEvent<HTMLElement>) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    const target = clientToTarget(e.clientX, e.clientY);
    if (target !== null) opts.onDrop(file, target);
    dragDepth.current = 0;
    setHoveredTarget(null);
  };

  return {
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
    hoveredTarget,
    reset: () => {
      dragDepth.current = 0;
      setHoveredTarget(null);
    },
  };
}
