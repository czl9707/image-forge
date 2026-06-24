// src/generators/swap-collage/SwapCollagePreview.tsx
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { Group, Layer, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import { useSwapCollage } from "./SwapCollageProvider";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  canvasDims,
  containFit,
  placeholderTextStrip,
  pointToSlot,
  tileLayout,
} from "./dimensions";
import { solveMask, solveSwapLayout, solveTransform } from "./layout";
import { clampCoverPos } from "@/lib/canvas/fit";
import type { Rect as RectGeom } from "@/lib/geometry";
import type { Slot } from "./swapReducer";
import { FilteredImage } from "@/components/filters/FilteredImage";

/** The two collage slots, in fixed order so every per-slot map iterates them. */
const SLOTS = ["A", "B"] as const satisfies readonly Slot[];

/** Target on-screen size (CSS px) for the placeholder hint, regardless of the
 *  stage scale / export size. Divided by `scale` at the call site to convert
 *  into the stage's logical units. */
const PLACEHOLDER_FONT_PX = 16;

/**
 * Empty-slot placeholder, drawn with Konva shapes so it lives natively on the
 * same Stage as real images (no separate HTML path, no async image decode).
 * A small centered hint over a 1px outline. Clicking it opens the file dialog;
 * it is never draggable or selectable for transform — only real images are.
 *
 * Reads its own theme colors via useThemeColors — no color props from upstream.
 */
function Placeholder({
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

/** The opaque placeholder shown in the swap box when a tile has no overlay
 *  image: a canvas-background-filled cutout with a muted outline. Reads its own
 *  theme colors via useThemeColors. */
function SwapBoxPlaceholder({ x, y, w, h }: RectGeom) {
  const { mutedForeground, background } = useThemeColors();
  return (
    <Rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill={background}
      stroke={mutedForeground}
      strokeWidth={1}
      listening={false}
    />
  );
}

/** The accent border drawn over the tile a file is being dragged onto. Lives on
 *  the unclipped top Layer so the 3px stroke isn't half-clipped at the tile
 *  edge; strokeWidth is divided by `scale` for a consistent ~3 CSS px regardless
 *  of stage zoom. Reads its own theme color via useThemeColors. */
function DropHighlight({
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

/** One tile's invisible draggable mask handle, positioned in canvas coords as
 *  `origin + maskPx` and tagged `name="overlay"` so exportImage can hide it for
 *  the snapshot. It reports its live node back up via `onHandleDrag`, which maps
 *  it into the shared normalized mask. (The visible swap box — opaque placeholder
 *  or the other slot's image — is rendered inside `renderTile`.) */
function MaskOverlay({
  origin,
  maskPx,
  onHandleDrag,
}: {
  origin: { x: number; y: number };
  maskPx: RectGeom;
  onHandleDrag: (node: Konva.Rect) => void;
}) {
  const x = origin.x + maskPx.x;
  const y = origin.y + maskPx.y;
  return (
    <Rect
      name="overlay"
      x={x}
      y={y}
      width={maskPx.w}
      height={maskPx.h}
      fill="rgba(0,0,0,0)"
      draggable
      onDragMove={(e) => onHandleDrag(e.target as Konva.Rect)}
    />
  );
}

export function SwapCollagePreview() {
  const { imgA, imgB, loadImage, state, dispatch, stageRef } = useSwapCollage();
  const slotImages = { A: imgA, B: imgB } as const;
  const containerRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });

  // One hidden file input per slot, so a click on a placeholder can open it.
  const fileRefs = {
    A: useRef<HTMLInputElement>(null),
    B: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setAvail({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dims = canvasDims(state.aspect, state.orientation, state.exportSize);
  const tiles = tileLayout(state.orientation, dims);
  const { dispW, dispH, scale } = containFit(
    dims.cw,
    dims.ch,
    avail.w || dims.cw,
    avail.h || dims.ch,
  );

  // The whole collage's placement, solved once per render in a pure module.
  // The swap cross-reference (each tile's overlay wears the other slot's
  // transform) is decided inside solveSwapLayout, not in this component.
  const layout = solveSwapLayout({
    tiles,
    mask: state.mask,
    images: {
      A: imgA.bitmap ? { w: imgA.bitmap.width, h: imgA.bitmap.height } : null,
      B: imgB.bitmap ? { w: imgB.bitmap.width, h: imgB.bitmap.height } : null,
    },
    xforms: { A: state.xformA, B: state.xformB },
  });
  const { maskPx } = layout;

  // The tile under the cursor during a file drag, or null. Purely view state —
  // not in swapReducer — driving the drop-target highlight.
  const [hoveredSlot, setHoveredSlot] = useState<Slot | null>(null);

  const openPicker = (slot: Slot) => fileRefs[slot].current?.click();

  const onPickFile = (slot: Slot) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadImage(slot, f);
    e.target.value = "";
  };

  // Map a drag/drop cursor position to the tile (A/B) it's over. The stage
  // canvas is centered in the container, so we map against the canvas's own
  // bounding rect; pointToSlot owns which half is which (mirroring the A/B
  // assignment in tileLayout). Shared by the highlight (onDragOver) and the
  // drop (onDrop) so they can't drift apart.
  const clientToSlot = (clientX: number, clientY: number): Slot | null => {
    const rect = stageRef.current?.container().getBoundingClientRect();
    if (!rect) return null;
    return pointToSlot(
      state.orientation,
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height,
    );
  };

  // Track which tile the cursor is over during a drag, for the highlight.
  // preventDefault so the browser allows the drop; only update state when the
  // slot actually changes to avoid re-render churn on every mousemove.
  const onDragOverFile = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const slot = clientToSlot(e.clientX, e.clientY);
    setHoveredSlot((prev) => (prev === slot ? prev : slot));
  };

  // Drop → load the file into the tile under the cursor (if any), then clear
  // the highlight. NOTE: onDragLeave clears unconditionally, which can flicker
  // when crossing internal element boundaries — accepted per the spec; a
  // drag-counter is the documented fallback if it proves noticeable.
  const onDropFile = (e: DragEvent<HTMLDivElement>) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    const slot = clientToSlot(e.clientX, e.clientY);
    if (slot) loadImage(slot, file);
    setHoveredSlot(null);
  };

  const onImageTransform = (slot: Slot, node: Konva.Image | null) => {
    const bmp = slotImages[slot].bitmap;
    if (!bmp || !node) return;
    dispatch({
      type: "SET_XFORM",
      slot,
      xform: solveTransform(
        node.x(),
        node.y(),
        node.width() * node.scaleX(),
        node.height() * node.scaleY(),
        bmp.width,
        bmp.height,
        tiles.tileW,
        tiles.tileH,
      ),
    });
  };

  // Solve a mask handle's pixel geometry back to the shared normalized mask via
  // the layout module's inverse (mirrors solveTransform). `solveMask` handles
  // the division by tile dims relative to the handle's tile origin.
  const onMaskTransform = (slot: Slot, node: Konva.Rect | null) => {
    if (!node) return;
    const origin = tiles[slot];
    dispatch({
      type: "SET_MASK",
      mask: solveMask(
        node.x(),
        node.y(),
        node.width() * node.scaleX(),
        node.height() * node.scaleY(),
        origin.x,
        origin.y,
        tiles.tileW,
        tiles.tileH,
      ),
    });
  };

  // Konva drives the node's position itself during a drag and ignores the React
  // x/y props until release, so clamping only in render would let the image
  // reveal an empty edge mid-drag. Force the node back inside the cover window
  // every move, then store the (clamped) transform.
  const clampAndCommit = (slot: Slot, node: Konva.Image) => {
    const w = node.width() * node.scaleX();
    const h = node.height() * node.scaleY();
    const clamped = clampCoverPos(node.x(), node.y(), w, h, tiles.tileW, tiles.tileH);
    node.x(clamped.x);
    node.y(clamped.y);
    onImageTransform(slot, node);
  };

  const renderTile = (
    slot: Slot,
    baseBmp: ImageBitmap | null,
    otherBmp: ImageBitmap | null,
    origin: { x: number; y: number },
  ) => {
    const { base, overlay } = layout.tiles[slot];
    return (
      <Group
        x={origin.x}
        y={origin.y}
        clip={{ x: 0, y: 0, width: tiles.tileW, height: tiles.tileH }}
      >
        {base && baseBmp ? (
          <FilteredImage
            stack={slot === "A" ? state.filtersA : state.filtersB}
            image={baseBmp}
            {...base}
            draggable
            onDragMove={(e) => clampAndCommit(slot, e.target as Konva.Image)}
          />
        ) : (
          <Placeholder
            tileW={tiles.tileW}
            tileH={tiles.tileH}
            fontSize={PLACEHOLDER_FONT_PX / scale}
            strokeWidth={1 / scale}
            highlighted={hoveredSlot === slot}
            onActivate={() => openPicker(slot)}
          />
        )}
        {overlay && otherBmp ? (
          <Group clip={{ x: maskPx.x, y: maskPx.y, width: maskPx.w, height: maskPx.h }}>
            <FilteredImage
              stack={slot === "A" ? state.filtersB : state.filtersA}
              image={otherBmp}
              {...overlay}
              listening={false}
            />
          </Group>
        ) : (
          <SwapBoxPlaceholder x={maskPx.x} y={maskPx.y} w={maskPx.w} h={maskPx.h} />
        )}
      </Group>
    );
  };

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
      onDragOver={onDragOverFile}
      onDragLeave={() => setHoveredSlot(null)}
      onDrop={onDropFile}
    >
      <Stage
        ref={stageRef as unknown as React.Ref<Konva.Stage>}
        width={dispW}
        height={dispH}
        scaleX={scale}
        scaleY={scale}
      >
        <Layer>
          {renderTile("A", imgA.bitmap, imgB.bitmap, tiles.A)}
          {renderTile("B", imgB.bitmap, imgA.bitmap, tiles.B)}
        </Layer>

        {/* Drop-target highlight + mask drag handles. Top layer, unclipped, canvas
            coords. The highlight lives here (not in the clipped tile Group) so the
            3px border isn't half-clipped at the tile edge. strokeWidth is divided
            by `scale` so it renders a consistent ~3 CSS px regardless of stage zoom. */}
        <Layer>
          {SLOTS.map((slot) => {
            const origin = tiles[slot];
            return (
              <DropHighlight
                key={`drop-${slot}`}
                x={origin.x}
                y={origin.y}
                width={tiles.tileW}
                height={tiles.tileH}
                scale={scale}
                visible={hoveredSlot === slot}
              />
            );
          })}
          {SLOTS.map((slot) => (
            <MaskOverlay
              key={slot}
              origin={tiles[slot]}
              maskPx={maskPx}
              onHandleDrag={(node) => onMaskTransform(slot, node)}
            />
          ))}
        </Layer>
      </Stage>

      {/* Hidden pickers backing the placeholder click affordance. */}
      {SLOTS.map((slot) => (
        <input
          key={slot}
          ref={fileRefs[slot]}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile(slot)}
        />
      ))}

    </div>
  );
}
