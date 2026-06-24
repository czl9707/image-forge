// src/generators/swap-collage/SwapCollagePreview.tsx
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Group, Layer, Rect, Stage } from "react-konva";
import type Konva from "konva";
import { useSwapCollage } from "./SwapCollageProvider";
import { useThemeColors } from "@/hooks/useThemeColors";
import { DropHighlight } from "@/components/canvas/DropHighlight";
import { EmptySlotPlaceholder } from "@/components/canvas/EmptySlotPlaceholder";
import { useFileDrop } from "@/components/canvas/useFileDrop";
import { canvasDims } from "@/lib/canvas/dimensions";
import { containFit } from "@/lib/canvas/fit";
import { pointToSlot, tileLayout } from "./dimensions";
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

  const openPicker = (slot: Slot) => fileRefs[slot].current?.click();

  const onPickFile = (slot: Slot) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadImage(slot, f);
    e.target.value = "";
  };

  // Image-file drag-and-drop over the stage. The hook owns the generic drag
  // mechanics + the drop-target highlight state; we supply the A/B slot mapping
  // (`pointToSlot`) and the load action.
  const { dropProps, hoveredTarget } = useFileDrop<Slot>({
    stageRef,
    resolve: (x, y, w, h) => pointToSlot(state.orientation, x, y, w, h),
    onDrop: (file, slot) => loadImage(slot, file),
  });

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
          <EmptySlotPlaceholder
            tileW={tiles.tileW}
            tileH={tiles.tileH}
            fontSize={PLACEHOLDER_FONT_PX / scale}
            strokeWidth={1 / scale}
            highlighted={hoveredTarget === slot}
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
      {...dropProps}
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
                visible={hoveredTarget === slot}
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
