// src/components/canvas/EmptySlotPlaceholder.tsx
import { Group, Rect, Text } from "react-konva";
import { useThemeColors } from "@/hooks/useThemeColors";
import { placeholderTextStrip } from "@/lib/canvas/dimensions";

/**
 * Empty-slot placeholder, drawn with Konva shapes so it lives natively on the
 * same Stage as real images (no separate HTML path, no async image decode).
 * A small centered hint over a 1px outline. Clicking it opens the file dialog;
 * it is never draggable or selectable for transform — only real images are.
 *
 * Reads its own theme colors via useThemeColors — no color props from upstream.
 */
export function EmptySlotPlaceholder({
  tileW,
  tileH,
  fontSize,
  strokeWidth,
  highlighted,
  onActivate,
}: {
  tileW: number;
  tileH: number;
  fontSize: number;
  strokeWidth: number;
  highlighted: boolean;
  onActivate: () => void;
}) {
  const { mutedForeground, primary } = useThemeColors();
  const strip = placeholderTextStrip(tileH);
  // When this tile is the drop target, the placeholder text turns primary.
  const textColor = highlighted && primary ? primary : mutedForeground;
  // The outline is inset by half its (screen-consistent) stroke width so the
  // full stroke lands inside the tile clip. Otherwise the clip eats the outer
  // half at the right/bottom edges and the shared A/B seam, leaving a sub-pixel
  // sliver that aliases away at many stage scales (the "border sometimes
  // hidden" bug). strokeWidth is in logical units, so divide by scale for a
  // true ~1 CSS px border. Adjacent empty tiles share a ~2px divider, which
  // reads as a normal box seam.
  return (
    <Group onMouseDown={onActivate} onTap={onActivate}>
      <Rect
        x={strokeWidth / 2}
        y={strokeWidth / 2}
        width={tileW - strokeWidth}
        height={tileH - strokeWidth}
        stroke={mutedForeground}
        strokeWidth={strokeWidth}
      />
      <Text
        text="Drop or click to upload"
        width={tileW}
        y={strip.y}
        height={strip.height}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fill={textColor}
        listening={false}
      />
    </Group>
  );
}
