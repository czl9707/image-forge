// src/generators/swap-collage/SwapCollageControls.tsx
import { useState } from "react";
import { Columns2, Download, Rows2 } from "lucide-react";
import { useSwapCollage } from "./SwapCollageProvider";
import { type ExportFormat } from "@/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MASK_MIN } from "./swapReducer";
import type { AspectId, Orientation } from "./swapReducer";
import { canvasDims } from "@/lib/canvas/dimensions";
import { tileLayout } from "./dimensions";
import { FieldLabel } from "@/components/canvas/FieldLabel";
import { ImageSlotControls } from "@/components/canvas/ImageSlotControls";

/** A swap-size dimension in px: drag the slider OR type a whole-pixel value
 *  (clamped to the tile dimension, at least MASK_MIN of it). The field is
 *  uncontrolled and keyed on the px value — typing commits on blur/Enter, and a
 *  slider drag remounts the field to reflect the new size. `value` is the
 *  normalized [0,1] mask fraction; `maxPx` is the tile dimension in export px. */
function DimensionSlider({
  label,
  value,
  maxPx,
  onChange,
}: {
  label: string;
  value: number;
  maxPx: number;
  onChange: (v: number) => void;
}) {
  const minPx = Math.max(1, Math.round(MASK_MIN * maxPx));
  const px = Math.round(value * maxPx);
  const commit = (raw: string) => {
    const n = Math.round(Number(raw));
    const clamped = Number.isFinite(n) ? Math.min(maxPx, Math.max(minPx, n)) : minPx;
    onChange(clamped / maxPx);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>{label}</FieldLabel>
        <div className="flex items-center gap-1">
          <Input
            key={px}
            defaultValue={String(px)}
            inputMode="numeric"
            className="h-7 w-16 text-right"
            onBlur={(e) => commit((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <span className="text-xs text-muted-foreground">px</span>
        </div>
      </div>
      <Slider
        value={[px]}
        min={minPx}
        max={maxPx}
        step={1}
        onValueChange={([v]) => onChange(v / maxPx)}
      />
    </div>
  );
}

function MaskSizeControls({
  width,
  height,
  maxW,
  maxH,
  onWidth,
  onHeight,
}: {
  width: number;
  height: number;
  maxW: number;
  maxH: number;
  onWidth: (w: number) => void;
  onHeight: (h: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <DimensionSlider label="Swap Width" value={width} maxPx={maxW} onChange={onWidth} />
      <DimensionSlider label="Swap Height" value={height} maxPx={maxH} onChange={onHeight} />
    </div>
  );
}

export function SwapCollageControls() {
  const { imgA, imgB, loadImage, clearImage, state, dispatch, exportImage } =
    useSwapCollage();
  const [format, setFormat] = useState<ExportFormat>("png");

  const bothReady = imgA.status === "ready" && imgB.status === "ready";

  const onExport = () => exportImage(format);

  // Tile pixel dims (at export resolution) so the swap-size fields can show px.
  const dims = canvasDims(state.aspect, state.orientation, state.exportSize);
  const tiles = tileLayout(state.orientation, dims);

  return (
    <div className="flex h-full w-full flex-col p-4">
      <Accordion
        type="multiple"
        defaultValue={["image-a", "image-b"]}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none"
      >
        <AccordionItem value="image-a">
          <AccordionTrigger>Image A</AccordionTrigger>
          <AccordionContent className="space-y-4">
            {/* Sizing lives here, not on the canvas: a zoom slider per loaded
                image (zoom is a scalar), and width/height for the shared swap
                box. The canvas is position-only — see SwapCollagePreview. */}
            <ImageSlotControls
              name={imgA.name}
              status={imgA.status}
              error={imgA.error}
              zoom={state.xformA.zoom}
              onZoom={(z) =>
                dispatch({
                  type: "SET_XFORM",
                  slot: "A",
                  xform: { ...state.xformA, zoom: z },
                })
              }
              filters={state.filtersA}
              onFilters={(f) => dispatch({ type: "SET_FILTERS", slot: "A", filters: f })}
              disabled={imgA.status !== "ready"}
              onPick={(file) => loadImage("A", file)}
              onClear={() => clearImage("A")}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="image-b">
          <AccordionTrigger>Image B</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <ImageSlotControls
              name={imgB.name}
              status={imgB.status}
              error={imgB.error}
              zoom={state.xformB.zoom}
              onZoom={(z) =>
                dispatch({
                  type: "SET_XFORM",
                  slot: "B",
                  xform: { ...state.xformB, zoom: z },
                })
              }
              filters={state.filtersB}
              onFilters={(f) => dispatch({ type: "SET_FILTERS", slot: "B", filters: f })}
              disabled={imgB.status !== "ready"}
              onPick={(file) => loadImage("B", file)}
              onClear={() => clearImage("B")}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="layout">
          <AccordionTrigger>Layout</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <MaskSizeControls
              width={state.mask.w}
              height={state.mask.h}
              maxW={tiles.tileW}
              maxH={tiles.tileH}
              onWidth={(w) => dispatch({ type: "SET_MASK", mask: { ...state.mask, w } })}
              onHeight={(h) => dispatch({ type: "SET_MASK", mask: { ...state.mask, h } })}
            />
            <div className="flex flex-col gap-2">
              <FieldLabel>Orientation</FieldLabel>
              <Tabs
                value={state.orientation}
                onValueChange={(v) =>
                  dispatch({
                    type: "SET_ORIENTATION",
                    orientation: v as Orientation,
                  })
                }
              >
                <TabsList className="w-full">
                  <TabsTrigger value="lr">
                    <Columns2 /> Left/Right
                  </TabsTrigger>
                  <TabsTrigger value="tb">
                    <Rows2 /> Top/Bottom
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Aspect</FieldLabel>
              <Tabs
                value={state.aspect}
                onValueChange={(v) =>
                  dispatch({ type: "SET_ASPECT", aspect: v as AspectId })
                }
              >
                <TabsList className="w-full">
                  <TabsTrigger value="16:9">16:9</TabsTrigger>
                  <TabsTrigger value="4:3">4:3</TabsTrigger>
                  <TabsTrigger value="1:1">1:1</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="export">
          <AccordionTrigger>Export</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <FieldLabel>Export size</FieldLabel>
              <Select
                value={String(state.exportSize)}
                onValueChange={(v) =>
                  dispatch({ type: "SET_EXPORT_SIZE", size: Number(v) })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080">1080px</SelectItem>
                  <SelectItem value="2160">2160px</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Format</FieldLabel>
              <Tabs value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                <TabsList className="w-full">
                  <TabsTrigger value="png">PNG</TabsTrigger>
                  <TabsTrigger value="jpg">JPG</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="pt-4">
        <Button onClick={onExport} disabled={!bothReady} className="w-full">
          <Download /> Export
        </Button>
      </div>
    </div>
  );
}
