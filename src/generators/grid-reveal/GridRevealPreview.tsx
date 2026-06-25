// src/generators/grid-reveal/GridRevealPreview.tsx
import { useEffect, useRef, useState, type ChangeEvent, type Ref } from "react";
import { Group, Layer, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import { useGridReveal } from "./GridRevealProvider";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useFileDrop } from "@/components/canvas/useFileDrop";
import { DropHighlight } from "@/components/canvas/DropHighlight";
import { EmptySlotPlaceholder } from "@/components/canvas/EmptySlotPlaceholder";
import { FilteredImage } from "@/components/filters/FilteredImage";
import { canvasDims } from "@/lib/canvas/dimensions";
import { containFit, coverFit } from "@/lib/canvas/fit";
import {
  BORDER_COLOR,
  BORDER_OPACITY,
  BORDER_WIDTH,
  cellRects,
  hitTest,
  placement,
  splitLines,
} from "./layout";
import type { Slot } from "./gridRevealReducer";

/** Click vs drag threshold in CSS px (pointer movement below this = click). */
const CLICK_THRESHOLD_PX = 5;

/** Target on-screen size (CSS px) for the empty-canvas upload hint. Divided by
 *  `scale` at the call site to convert into the stage's logical units. */
const PLACEHOLDER_FONT_PX = 16;

/** Decoration: tiny index number in each cell's bottom-left corner. Same grey
 *  as the grid borders, baked into export. Logical px (not /scale). */
const CELL_LABEL_FONT_PX = 11;
const CELL_LABEL_INSET = 5;

interface DragState {
  startClientX: number;
  startClientY: number;
  startPanX: number;
  startPanY: number;
  row: number;
  col: number;
  slot: Slot;
  moved: boolean;
}

export function GridRevealPreview() {
  const {
    imgTop,
    imgBottom,
    state,
    dispatch,
    stageRef,
    loadInOrder,
  } = useGridReveal();
  const { background } = useThemeColors();
  const containerRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const dragRef = useRef<DragState | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setAvail({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dims = canvasDims(state.aspect, state.orientation, state.exportSize);
  const { dispW, dispH, scale } = containFit(
    dims.cw,
    dims.ch,
    avail.w || dims.cw,
    avail.h || dims.ch,
  );

  const grid = cellRects(state.colStrips, state.rowStrips, dims.cw, dims.ch);
  const colLines = splitLines(state.colStrips, dims.cw);
  const rowLines = splitLines(state.rowStrips, dims.ch);

  const topBmp = imgTop.bitmap;
  const bottomBmp = imgBottom.bitmap;
  const topPlace = topBmp
    ? placement(topBmp.width, topBmp.height, dims.cw, dims.ch, state.xformTop)
    : null;
  const bottomPlace = bottomBmp
    ? placement(bottomBmp.width, bottomBmp.height, dims.cw, dims.ch, state.xformBottom)
    : null;

  const bothReady = imgTop.status === "ready" && imgBottom.status === "ready";
  const isEmpty = !topBmp && !bottomBmp;

  // The empty-canvas placeholder opens a file picker; the chosen file fills the
  // next slot by order (Bottom first, then Top).
  const openPicker = () => pickerRef.current?.click();
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void loadInOrder(f);
    e.target.value = "";
  };

  // Map a screen point to logical canvas coords via the stage container rect.
  const toLogical = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.container().getBoundingClientRect();
    if (!rect) return null;
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (!bothReady) return;
    const lp = toLogical(e.evt.clientX, e.evt.clientY);
    if (!lp) return;
    const hit = hitTest(lp.x, lp.y, state.colStrips, state.rowStrips, dims.cw, dims.ch);
    if (!hit) return;
    const slot: Slot = state.cells[hit.row][hit.col] ? "bottom" : "top";
    const xform = slot === "top" ? state.xformTop : state.xformBottom;
    dragRef.current = {
      startClientX: e.evt.clientX,
      startClientY: e.evt.clientY,
      startPanX: xform.panX,
      startPanY: xform.panY,
      row: hit.row,
      col: hit.col,
      slot,
      moved: false,
    };
  };

  const onPointerMove = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.evt.clientX - d.startClientX;
    const dy = e.evt.clientY - d.startClientY;
    if (!d.moved && Math.hypot(dx, dy) < CLICK_THRESHOLD_PX) return;
    d.moved = true;
    const bmp = d.slot === "top" ? topBmp : bottomBmp;
    if (!bmp) return;
    // Slack = how far the cover-fit × zoom image exceeds the canvas (logical px).
    const zoom = d.slot === "top" ? state.xformTop.zoom : state.xformBottom.zoom;
    const coverScale = coverFit(bmp.width, bmp.height, dims.cw, dims.ch).scale * zoom;
    const slackX = bmp.width * coverScale - dims.cw;
    const slackY = bmp.height * coverScale - dims.ch;
    // Dragging the image right (dx>0) reveals more of its left → panX drops.
    const panX = slackX > 0 ? d.startPanX - dx / scale / slackX : d.startPanX;
    const panY = slackY > 0 ? d.startPanY - dy / scale / slackY : d.startPanY;
    dispatch({ type: "SET_XFORM", slot: d.slot, xform: { panX, panY, zoom } });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return; // a drag already committed pan; click → flip
    dispatch({ type: "FLIP_CELL", row: d.row, col: d.col });
  };

  // Drag-drop a file anywhere on the canvas → fill the next slot by order
  // (Bottom first, then Top, then replace Top).
  const { dropProps, hoveredTarget } = useFileDrop<boolean>({
    stageRef,
    resolve: () => true, // whole canvas is the target
    onDrop: (file) => {
      void loadInOrder(file);
    },
  });

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
      {...dropProps}
    >
      <Stage
        ref={stageRef as unknown as Ref<Konva.Stage>}
        width={dispW}
        height={dispH}
        scaleX={scale}
        scaleY={scale}
      >
        {/* Image layer. Empty canvas → the upload placeholder (border + hint,
            clickable, reuses the swap-collage affordance). Otherwise one clipped
            draw per cell at viewport placement so each image reads as one
            continuous picture across its cells. A cell whose chosen image is
            missing (partial load) falls back to the other image. */}
        <Layer>
          <Rect
            x={0}
            y={0}
            width={dims.cw}
            height={dims.ch}
            fill={background}
            listening={false}
          />
          {isEmpty ? (
            <EmptySlotPlaceholder
              tileW={dims.cw}
              tileH={dims.ch}
              fontSize={PLACEHOLDER_FONT_PX / scale}
              strokeWidth={1 / scale}
              highlighted={hoveredTarget === true}
              onActivate={openPicker}
            />
          ) : (
            grid.map((row, ri) =>
              row.map((cell, ci) => {
                const showBottom = state.cells[ri][ci];
                const bmp =
                  (showBottom ? bottomBmp : topBmp) ??
                  (showBottom ? topBmp : bottomBmp);
                const place =
                  (showBottom ? bottomPlace : topPlace) ??
                  (showBottom ? topPlace : bottomPlace);
                if (!bmp || !place) return null;
                const stack =
                  bmp === bottomBmp ? state.filtersBottom : state.filtersTop;
                return (
                  <Group
                    key={`cell-${ri}-${ci}`}
                    clip={{ x: cell.x, y: cell.y, width: cell.w, height: cell.h }}
                  >
                    <FilteredImage
                      stack={stack}
                      image={bmp}
                      x={place.x}
                      y={place.y}
                      width={place.width}
                      height={place.height}
                      listening={false}
                    />
                  </Group>
                );
              }),
            )
          )}
        </Layer>

        {/* Border layer: the grey grid skeleton, always drawn — even over the
            empty-canvas upload placeholder — and baked into export. */}
        <Layer listening={false}>
          {colLines.map((x, i) => (
            <Rect
              key={`cv-${i}`}
              x={x - BORDER_WIDTH / 2}
              y={0}
              width={BORDER_WIDTH}
              height={dims.ch}
              fill={BORDER_COLOR}
              opacity={BORDER_OPACITY}
            />
          ))}
          {rowLines.map((y, i) => (
            <Rect
              key={`rh-${i}`}
              x={0}
              y={y - BORDER_WIDTH / 2}
              width={dims.cw}
              height={BORDER_WIDTH}
              fill={BORDER_COLOR}
              opacity={BORDER_OPACITY}
            />
          ))}
          {/* Decoration: zero-padded cell index in each cell's bottom-left
              corner. Row-major numbering (01 across the first row, then 02…).
              Kept inside the border layer so it shares the grid's grey and is
              baked into the export. */}
          {grid.map((row, ri) =>
            row.map((cell, ci) => (
              <Text
                key={`cl-${ri}-${ci}`}
                x={cell.x + CELL_LABEL_INSET}
                y={cell.y + cell.h - CELL_LABEL_FONT_PX - CELL_LABEL_INSET}
                text={String(ri * row.length + ci + 1).padStart(2, "0")}
                fontSize={CELL_LABEL_FONT_PX}
                fill={BORDER_COLOR}
                opacity={BORDER_OPACITY}
                listening={false}
              />
            )),
          )}
        </Layer>

        {/* Drop highlight over the whole canvas while dragging a file in. */}
        {hoveredTarget === true && (
          <Layer listening={false}>
            <DropHighlight
              x={0}
              y={0}
              width={dims.cw}
              height={dims.ch}
              scale={scale}
              visible
            />
          </Layer>
        )}

        {/* Hit layer: transparent, captures pointer; hidden at export (.overlay).
            Only rendered when there are images to interact with — when the
            canvas is empty the placeholder itself receives the click. */}
        {!isEmpty && (
          <Layer>
            <Rect
              name="overlay"
              x={0}
              y={0}
              width={dims.cw}
              height={dims.ch}
              fill="rgba(0,0,0,0)"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => {
                dragRef.current = null;
              }}
            />
          </Layer>
        )}
      </Stage>

      {/* Hidden picker backing the empty-canvas placeholder click. */}
      <input
        ref={pickerRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPick}
      />
    </div>
  );
}
