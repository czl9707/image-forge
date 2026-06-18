// src/generators/swap-collage/SwapCollagePreview.tsx
import { useEffect, useRef, useState } from "react";
import {
  Group,
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import { useSwapCollage } from "./SwapCollageProvider";
import { canvasDims, containFit, tileLayout } from "./dimensions";
import { coverFit } from "@/lib/canvas/fit";
import { toPixels } from "@/lib/geometry";
import { ImageDropzone } from "@/components/shared/ImageDropzone";
import type { Slot, Transform } from "./swapReducer";

interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

function placement(
  iw: number,
  ih: number,
  tileW: number,
  tileH: number,
  xform: Transform,
): Placement {
  const { scale } = coverFit(iw, ih, tileW, tileH);
  const width = iw * scale * xform.zoom;
  const height = ih * scale * xform.zoom;
  return {
    width,
    height,
    x: (tileW - width) / 2 + xform.panX * tileW,
    y: (tileH - height) / 2 + xform.panY * tileH,
  };
}

/** Solve a node's geometry back to a resolution-stable transform. */
function solveXform(
  node: Konva.Image,
  iw: number,
  ih: number,
  tileW: number,
  tileH: number,
): Transform {
  const { scale } = coverFit(iw, ih, tileW, tileH);
  const width = node.width() * node.scaleX();
  const height = node.height() * node.scaleY();
  const zoom = width / (iw * scale);
  return {
    zoom,
    panX: (node.x() - (tileW - width) / 2) / tileW,
    panY: (node.y() - (tileH - height) / 2) / tileH,
  };
}

export function SwapCollagePreview() {
  const { imgA, imgB, loadImage, state, dispatch, stageRef } = useSwapCollage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });

  // node refs for selection → Transformer binding
  const imgARef = useRef<Konva.Image | null>(null);
  const imgBRef = useRef<Konva.Image | null>(null);
  const maskARef = useRef<Konva.Rect | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);

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

  // keep the Transformer bound to the selected node
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node =
      state.selection === "imgA"
        ? imgARef.current
        : state.selection === "imgB"
          ? imgBRef.current
          : state.selection === "mask"
            ? maskARef.current
            : null;
    tr.nodes(node ? [node] : []);
    // images keep aspect (uniform zoom); the mask is a free rectangle
    tr.keepRatio(state.selection === "imgA" || state.selection === "imgB");
    tr.getLayer()?.batchDraw();
  }, [state.selection, imgA.status, imgB.status]);

  const dims = canvasDims(state.aspect, state.exportSize);
  const tiles = tileLayout(state.orientation, dims);
  const { dispW, dispH, scale } = containFit(
    dims.cw,
    dims.ch,
    avail.w || dims.cw,
    avail.h || dims.ch,
  );

  const maskPx = toPixels(state.mask, tiles.tileW, tiles.tileH);

  const selectSlot = (slot: Slot) => dispatch({ type: "SET_SELECTION", selection: slot === "A" ? "imgA" : "imgB" });
  const selectMask = () => dispatch({ type: "SET_SELECTION", selection: "mask" });
  const deselect = () => dispatch({ type: "SET_SELECTION", selection: null });

  const onImageTransform = (slot: Slot, node: Konva.Image | null) => {
    const bmp = slot === "A" ? imgA.bitmap : imgB.bitmap;
    if (!bmp) return;
    dispatch({
      type: "SET_XFORM",
      slot,
      xform: solveXform(node!, bmp.width, bmp.height, tiles.tileW, tiles.tileH),
    });
  };

  const onMaskTransform = (node: Konva.Rect | null) => {
    if (!node) return;
    const origin = tiles.A; // tile A origin is always (0,0)
    dispatch({
      type: "SET_MASK",
      mask: {
        x: (node.x() - origin.x) / tiles.tileW,
        y: (node.y() - origin.y) / tiles.tileH,
        w: node.width() * node.scaleX() / tiles.tileW,
        h: node.height() * node.scaleY() / tiles.tileH,
      },
    });
  };

  const renderTile = (
    slot: "A" | "B",
    baseBmp: ImageBitmap | null,
    otherBmp: ImageBitmap | null,
    xform: Transform,
    origin: { x: number; y: number },
    imgRef: React.RefObject<Konva.Image | null>,
  ) => {
    const base = baseBmp
      ? placement(baseBmp.width, baseBmp.height, tiles.tileW, tiles.tileH, xform)
      : null;
    const overlay = otherBmp
      ? placement(
          otherBmp.width,
          otherBmp.height,
          tiles.tileW, tiles.tileH,
          slot === "A" ? state.xformB : state.xformA,
        )
      : null;
    return (
      <Group
        x={origin.x}
        y={origin.y}
        clip={{ x: 0, y: 0, width: tiles.tileW, height: tiles.tileH }}
      >
        {base && (
          <KonvaImage
            ref={imgRef}
            image={baseBmp ?? undefined}
            {...base}
            draggable
            onMouseDown={() => selectSlot(slot)}
            onDragEnd={(e) => onImageTransform(slot, e.target as Konva.Image)}
            onTransformEnd={(e) => onImageTransform(slot, e.target as Konva.Image)}
          />
        )}
        {overlay && otherBmp && (
          <Group clip={{ x: maskPx.x, y: maskPx.y, width: maskPx.w, height: maskPx.h }}>
            <KonvaImage image={otherBmp} {...overlay} listening={false} />
          </Group>
        )}
      </Group>
    );
  };

  const bothReady = imgA.status === "ready" && imgB.status === "ready";

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
    >
      {!bothReady ? (
        <div className="flex h-full w-full gap-2">
          <ImageDropzone
            status={imgA.status}
            error={imgA.error}
            onFile={(f) => loadImage("A", f)}
          />
          <ImageDropzone
            status={imgB.status}
            error={imgB.error}
            onFile={(f) => loadImage("B", f)}
          />
        </div>
      ) : (
        <Stage
          ref={stageRef as unknown as React.Ref<Konva.Stage>}
          width={dispW}
          height={dispH}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) deselect();
          }}
        >
          <Layer>
            {renderTile("A", imgA.bitmap, imgB.bitmap, state.xformA, tiles.A, imgARef)}
            {renderTile("B", imgB.bitmap, imgA.bitmap, state.xformB, tiles.B, imgBRef)}
          </Layer>

          {/* mask UI on top, unclipped, canvas coords */}
          <Layer>
            <Rect
              ref={maskARef}
              x={tiles.A.x + maskPx.x}
              y={tiles.A.y + maskPx.y}
              width={maskPx.w}
              height={maskPx.h}
              stroke="#3b82f6"
              strokeWidth={2 / scale}
              dash={[8 / scale, 6 / scale]}
              draggable
              onMouseDown={selectMask}
              onDragEnd={(e) => onMaskTransform(e.target as Konva.Rect)}
              onTransformEnd={(e) => onMaskTransform(e.target as Konva.Rect)}
            />
            <Rect
              x={tiles.B.x + maskPx.x}
              y={tiles.B.y + maskPx.y}
              width={maskPx.w}
              height={maskPx.h}
              stroke="#3b82f6"
              strokeWidth={2 / scale}
              dash={[8 / scale, 6 / scale]}
              listening={false}
            />
          </Layer>

          <Layer>
            <Transformer
              ref={trRef as unknown as React.Ref<Konva.Transformer>}
              rotateEnabled={false}
              flipEnabled={false}
              boundBoxFunc={(_oldBox, newBox) => {
                // min size guard for the mask; images keep ratio via keepRatio
                if (newBox.width < 10 || newBox.height < 10) return _oldBox;
                return newBox;
              }}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}
