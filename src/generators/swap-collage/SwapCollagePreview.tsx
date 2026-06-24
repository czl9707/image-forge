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
import { useTheme } from "next-themes";
import { useSwapCollage } from "./SwapCollageProvider";
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
 */
function Placeholder({
  tileW,
  tileH,
  fontSize,
  mutedFg,
  accentFg,
  highlighted,
  onActivate,
}: {
  tileW: number;
  tileH: number;
  fontSize: number;
  mutedFg: string;
  accentFg: string;
  highlighted: boolean;
  onActivate: () => void;
}) {
  const strip = placeholderTextStrip(tileH);
  // When this tile is the drop target, the placeholder text turns accent so the
  // user sees the effect on the text as well as the border (which is drawn on
  // the unclipped top Layer, not here).
  const textColor = highlighted && accentFg ? accentFg : mutedFg;
  return (
    <Group onMouseDown={onActivate} onTap={onActivate}>
      <Rect x={0} y={0} width={tileW} height={tileH} stroke={mutedFg} strokeWidth={1} />
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

  // Off-screen sentinel wearing the muted-foreground Tailwind class; we read its
  // computed text color. That yields a resolved rgb() value that Konva/canvas
  // always accepts and that tracks light/dark correctly (reading the raw oklch
  // token directly proved unreliable). Its child span wears text-primary so we
  // read a resolved accent color from the SAME sentinel (no second sentinel).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [mutedFg, setMutedFg] = useState("");
  const [accentFg, setAccentFg] = useState("");
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    setMutedFg(getComputedStyle(el).color);
    const span = el.firstElementChild as HTMLElement | null;
    if (span) setAccentFg(getComputedStyle(span).color);
  }, [resolvedTheme]);

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
            mutedFg={mutedFg}
            accentFg={accentFg}
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
          <Rect
            x={maskPx.x}
            y={maskPx.y}
            width={maskPx.w}
            height={maskPx.h}
            fill={mutedFg}
            listening={false}
          />
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
              <Rect
                key={`drop-${slot}`}
                x={origin.x}
                y={origin.y}
                width={tiles.tileW}
                height={tiles.tileH}
                stroke={accentFg}
                strokeWidth={3 / scale}
                visible={hoveredSlot === slot}
                listening={false}
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

      {/* Sentinel: wears muted-foreground so we can read the resolved theme color;
          its child span wears text-primary so a later task can read a resolved
          accent color too. */}
      <div
        ref={sentinelRef}
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute h-0 w-0 opacity-0"
      >
        <span className="text-primary" />
      </div>
    </div>
  );
}
