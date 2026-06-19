// src/components/filters/FilteredImage.tsx
import { useEffect, useRef, type ComponentProps } from "react";
import { Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import { applyToNode, type FilterStack } from "@/lib/filters";

/**
 * A Konva image node whose filter stack is applied imperatively. react-konva
 * owns the node; we re-apply (and re-cache) whenever the stack or the node's
 * geometry (width/height) changes. Pan/drag (x/y) does NOT re-cache — the
 * cached filtered bitmap moves with the node.
 *
 * Pass through any KonvaImage props (draggable, onDragMove, listening, ...).
 */
export function FilteredImage({
  stack,
  ...props
}: ComponentProps<typeof KonvaImage> & { stack: FilterStack }) {
  const ref = useRef<Konva.Image | null>(null);

  // width/height come through as numbers in props; track them as deps so a
  // geometry change (e.g. zoom) re-caches the filtered bitmap at the new size.
  const { width, height, image } = props as {
    width?: number;
    height?: number;
    image?: CanvasImageSource;
  };

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    applyToNode(node, stack);
  }, [stack, width, height, image]);

  return <KonvaImage ref={ref} {...props} />;
}
