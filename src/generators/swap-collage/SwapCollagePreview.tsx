// src/generators/swap-collage/SwapCollagePreview.tsx
import {
  Fragment,
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
import { canvasDims, containFit, pointToSlot, tileLayout } from "./dimensions";
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
  onActivate,
}: {
  tileW: number;
  tileH: number;
  fontSize: number;
  mutedFg: string;
  onActivate: () => void;
}) {
  return (
    <Group onMouseDown={onActivate} onTap={onActivate}>
      <Rect x={0} y={0} width={tileW} height={tileH} stroke={mutedFg} strokeWidth={1} />
      <Text
        text="Drop or click to upload"
        width={tileW}
        height={tileH}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fill={mutedFg}
        listening={false}
      />
    </Group>
  );
}

/**
 * One tile's worth of mask UI: a translucent guide (shown only while this tile's
 * own image is still missing) plus an invisible draggable handle. Both are
 * positioned in canvas coords as `origin + maskPx` and tagged `name="overlay"`
 * so exportImage can hide them for the snapshot. The handle reports its live
 * node back up via `onHandleDrag`, which maps it into the shared normalized mask.
 */
function MaskOverlay({
  origin,
  show,
  maskPx,
  mutedFg,
  onHandleDrag,
}: {
  origin: { x: number; y: number };
  show: boolean;
  maskPx: RectGeom;
  mutedFg: string;
  onHandleDrag: (node: Konva.Rect) => void;
}) {
  const x = origin.x + maskPx.x;
  const y = origin.y + maskPx.y;
  return (
    <Fragment>
      {show && (
        <Rect
          name="overlay"
          x={x}
          y={y}
          width={maskPx.w}
          height={maskPx.h}
          fill={mutedFg}
          opacity={0.2}
          listening={false}
        />
      )}
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
    </Fragment>
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

  // Off-screen element wearing the muted-foreground Tailwind class; we read its
  // computed text color. That yields a resolved rgb() value that Konva/canvas
  // always accepts and that tracks light/dark correctly (reading the raw oklch
  // token directly proved unreliable).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [mutedFg, setMutedFg] = useState("");
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    setMutedFg(getComputedStyle(el).color);
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

  const openPicker = (slot: Slot) => fileRefs[slot].current?.click();

  const onPickFile = (slot: Slot) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadImage(slot, f);
    e.target.value = "";
  };

  // Drag a file onto the canvas → load it into whichever tile is under the
  // cursor. The stage canvas is centered in the container, so map the drop
  // point against the canvas's own bounding rect; pointToSlot owns which half
  // is which (mirroring the A/B assignment in tileLayout).
  const onDropFile = (e: DragEvent<HTMLDivElement>) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    const rect = stageRef.current?.container().getBoundingClientRect();
    if (!rect) return;
    loadImage(
      pointToSlot(
        state.orientation,
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
      ),
      file,
    );
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
            onActivate={() => openPicker(slot)}
          />
        )}
        {overlay && otherBmp && (
          <Group clip={{ x: maskPx.x, y: maskPx.y, width: maskPx.w, height: maskPx.h }}>
            <FilteredImage
              stack={slot === "A" ? state.filtersB : state.filtersA}
              image={otherBmp}
              {...overlay}
              listening={false}
            />
          </Group>
        )}
      </Group>
    );
  };

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
      onDragOver={(e) => e.preventDefault()}
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

        {/* Mask guides + handles. Top layer, unclipped, canvas coords. */}
        <Layer>
          {SLOTS.map((slot) => (
            <MaskOverlay
              key={slot}
              origin={tiles[slot]}
              show={slotImages[slot].status !== "ready"}
              maskPx={maskPx}
              mutedFg={mutedFg}
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

      {/* Sentinel: wears the muted-foreground class so we can read the resolved theme color. */}
      <div
        ref={sentinelRef}
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute h-0 w-0 opacity-0"
      />
    </div>
  );
}
