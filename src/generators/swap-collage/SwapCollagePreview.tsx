// src/generators/swap-collage/SwapCollagePreview.tsx
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  Group,
  Layer,
  Rect,
  Stage,
  Text,
} from "react-konva";
import type Konva from "konva";
import { useTheme } from "next-themes";
import { useSwapCollage } from "./SwapCollageProvider";
import { canvasDims, containFit, tileLayout } from "./dimensions";
import { solveSwapLayout, solveTransform } from "./layout";
import { clampCoverPos } from "@/lib/canvas/fit";
import type { Slot } from "./swapReducer";
import { FilteredImage } from "@/components/filters/FilteredImage";

/** Target on-screen size (CSS px) for the placeholder hint, regardless of the
 *  stage scale / export size. Divided by `scale` at the call site to convert
 *  into the stage's logical units. */
const PLACEHOLDER_FONT_PX = 16;

/** Swap-area guide border style, in on-screen px (divided by `scale` to use). */
const GUIDE_STROKE_PX = 1.5;
const GUIDE_DASH_PX: [number, number] = [6, 4];

/**
 * Empty-slot placeholder, drawn with Konva shapes so it lives natively on the
 * same Stage as real images (no separate HTML path, no async image decode).
 * A muted fill + small centered hint. Clicking it opens the file dialog; it is
 * never draggable or selectable for transform — only real images are.
 */
function Placeholder({
  tileW,
  tileH,
  fontSize,
  muted,
  mutedFg,
  onActivate,
}: {
  tileW: number;
  tileH: number;
  fontSize: number;
  muted: string;
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

export function SwapCollagePreview() {
  const { imgA, imgB, loadImage, state, dispatch, stageRef } = useSwapCollage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });

  // hidden file inputs so a click on a placeholder can open the picker
  const fileARef = useRef<HTMLInputElement>(null);
  const fileBRef = useRef<HTMLInputElement>(null);

  // Off-screen element wearing the muted Tailwind classes; we read its computed
  // background/text color. That yields resolved rgb() values that Konva/canvas
  // always accept and that track light/dark correctly (reading the raw oklch
  // tokens directly proved unreliable).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [pal, setPal] = useState({ muted: "", mutedFg: "" });
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const s = getComputedStyle(el);
    setPal({ muted: s.backgroundColor, mutedFg: s.color });
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

  const openPicker = (slot: Slot) =>
    (slot === "A" ? fileARef.current : fileBRef.current)?.click();

  const onPickFile = (slot: Slot) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadImage(slot, f);
    e.target.value = "";
  };

  // Drag a file onto the canvas → load it into whichever tile is under the
  // cursor. The stage canvas is centered in the container, so map the drop
  // point against the canvas's own bounding rect, then split on the midline.
  const onDropFile = (e: DragEvent<HTMLDivElement>) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    const rect = stageRef.current?.container().getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Split on the midline of whichever axis the orientation stacks along.
    const beforeMid =
      state.orientation === "lr" ? x < rect.width / 2 : y < rect.height / 2;
    loadImage(beforeMid ? "A" : "B", file);
  };

  const onImageTransform = (slot: Slot, node: Konva.Image | null) => {
    const bmp = slot === "A" ? imgA.bitmap : imgB.bitmap;
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

  // The mask is a single normalized rect shared by both tiles. A handle in
  // either tile maps its position back to a per-tile fraction using that tile's
  // own origin, so both handles drive the same state.mask.
  const onMaskTransform = (
    node: Konva.Rect | null,
    origin: { x: number; y: number },
  ) => {
    if (!node) return;
    dispatch({
      type: "SET_MASK",
      mask: {
        x: (node.x() - origin.x) / tiles.tileW,
        y: (node.y() - origin.y) / tiles.tileH,
        w: (node.width() * node.scaleX()) / tiles.tileW,
        h: (node.height() * node.scaleY()) / tiles.tileH,
      },
    });
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
            onDragMove={(e) => {
              // Konva drives the node's position itself during a drag and
              // ignores the React x/y props until release, so clamping only
              // in render would let the image reveal an empty edge mid-drag.
              // Force the node back inside the cover window every move, then
              // store the (clamped) transform via solveTransform.
              const node = e.target as Konva.Image;
              const w = node.width() * node.scaleX();
              const h = node.height() * node.scaleY();
              const clamped = clampCoverPos(
                node.x(),
                node.y(),
                w,
                h,
                tiles.tileW,
                tiles.tileH,
              );
              node.x(clamped.x);
              node.y(clamped.y);
              onImageTransform(slot, node);
            }}
          />
        ) : (
          <Placeholder
            tileW={tiles.tileW}
            tileH={tiles.tileH}
            fontSize={PLACEHOLDER_FONT_PX / scale}
            muted={pal.muted}
            mutedFg={pal.mutedFg}
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
          {/* Each tile gets two overlay nodes — a guide and a handle — both
              tagged `name="overlay"` so exportImage can hide them for the
              snapshot. The guide is a dashed outline of the swap window shown
              only while a tile's own image is still missing (a filled tile
              already reveals the swap through its content). The handle is an
              invisible, draggable rect that maps its position back into the
              shared normalized mask via its tile's origin. */}
          {([["A", imgA.status], ["B", imgB.status]] as const).map(
            ([slot, status]) => {
              const origin = slot === "A" ? tiles.A : tiles.B;
              return (
                <Fragment key={slot}>
                  {status !== "ready" && (
                    <Rect
                      name="overlay"
                      x={origin.x + maskPx.x}
                      y={origin.y + maskPx.y}
                      width={maskPx.w}
                      height={maskPx.h}
                      fill={pal.mutedFg}
                      opacity={0.2}
                      listening={false}
                    />
                  )}
                  <Rect
                    name="overlay"
                    x={origin.x + maskPx.x}
                    y={origin.y + maskPx.y}
                    width={maskPx.w}
                    height={maskPx.h}
                    fill="rgba(0,0,0,0)"
                    draggable
                    onDragMove={(e) =>
                      onMaskTransform(e.target as Konva.Rect, origin)
                    }
                  />
                </Fragment>
              );
            },
          )}
        </Layer>
      </Stage>

      {/* Hidden pickers backing the placeholder click affordance. */}
      <input
        ref={fileARef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickFile("A")}
      />
      <input
        ref={fileBRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickFile("B")}
      />

      {/* Sentinel: wears the muted classes so we can read resolved theme colors. */}
      <div
        ref={sentinelRef}
        aria-hidden
        className="bg-muted text-muted-foreground pointer-events-none absolute h-0 w-0 opacity-0"
      />
    </div>
  );
}
