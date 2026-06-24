// src/components/canvas/DropHighlight.tsx
import { Rect } from "react-konva";
import { useThemeColors } from "@/hooks/useThemeColors";

/** The accent border drawn over the tile a file is being dragged onto. Lives on
 *  the unclipped top Layer so the stroke isn't half-clipped at the tile edge;
 *  strokeWidth is divided by `scale` for a consistent ~2 CSS px regardless of
 *  stage zoom. Reads its own theme color via useThemeColors. */
export function DropHighlight({
  x,
  y,
  width,
  height,
  scale,
  visible,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  visible: boolean;
}) {
  const { primary } = useThemeColors();
  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      stroke={primary}
      strokeWidth={2 / scale}
      visible={visible}
      listening={false}
    />
  );
}
