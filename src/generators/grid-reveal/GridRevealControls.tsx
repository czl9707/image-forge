// src/generators/grid-reveal/GridRevealControls.tsx
import { useState } from "react";
import { Download, Shuffle } from "lucide-react";
import { useGridReveal } from "./GridRevealProvider";
import { type ExportFormat } from "@/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FieldLabel } from "@/components/canvas/FieldLabel";
import { ExportControls } from "@/components/canvas/ExportControls";
import { ImageSlotControls } from "@/components/canvas/ImageSlotControls";
import {
  MAX_DIM,
  MIN_DIM,
  type AspectId,
  type Orientation,
} from "./gridRevealReducer";

/** Whole-number grid-dimension input clamped to [MIN_DIM, MAX_DIM], committing
 *  on every change (controlled) — not only on blur. */
function DimInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const clamp = (raw: string) => {
    const n = Number(raw);
    return Number.isFinite(n)
      ? Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(n)))
      : MIN_DIM;
  };
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="number"
        min={MIN_DIM}
        max={MAX_DIM}
        value={value}
        className="h-9"
        onChange={(e) => onChange(clamp(e.target.value))}
      />
    </div>
  );
}

export function GridRevealControls() {
  const {
    imgTop,
    imgBottom,
    loadImage,
    clearImage,
    state,
    dispatch,
    exportImage,
  } = useGridReveal();
  const [format, setFormat] = useState<ExportFormat>("png");

  const bothReady = imgTop.status === "ready" && imgBottom.status === "ready";

  return (
    <div className="flex h-full w-full flex-col p-4">
      <Accordion
        type="multiple"
        defaultValue={["image-top", "image-bottom", "grid"]}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none"
      >
        <AccordionItem value="image-top">
          <AccordionTrigger>Top image</AccordionTrigger>
          <AccordionContent className="space-y-4">
            {/* Reuses the shared ImageSlotControls (source + zoom + filters),
                same as Swap Collage. Pan stays a canvas drag, no sidebar pan. */}
            <ImageSlotControls
              name={imgTop.name}
              status={imgTop.status}
              error={imgTop.error}
              zoom={state.xformTop.zoom}
              onZoom={(z) =>
                dispatch({
                  type: "SET_XFORM",
                  slot: "top",
                  xform: { ...state.xformTop, zoom: z },
                })
              }
              filters={state.filtersTop}
              onFilters={(f) => dispatch({ type: "SET_FILTERS", slot: "top", filters: f })}
              disabled={imgTop.status !== "ready"}
              onPick={(file) => loadImage("top", file)}
              onClear={() => clearImage("top")}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="image-bottom">
          <AccordionTrigger>Bottom image</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <ImageSlotControls
              name={imgBottom.name}
              status={imgBottom.status}
              error={imgBottom.error}
              zoom={state.xformBottom.zoom}
              onZoom={(z) =>
                dispatch({
                  type: "SET_XFORM",
                  slot: "bottom",
                  xform: { ...state.xformBottom, zoom: z },
                })
              }
              filters={state.filtersBottom}
              onFilters={(f) => dispatch({ type: "SET_FILTERS", slot: "bottom", filters: f })}
              disabled={imgBottom.status !== "ready"}
              onPick={(file) => loadImage("bottom", file)}
              onClear={() => clearImage("bottom")}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="grid">
          <AccordionTrigger>Grid</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <FieldLabel>Mode</FieldLabel>
              <Tabs
                value={state.mode}
                onValueChange={(v) =>
                  dispatch({ type: "SET_MODE", mode: v as "equal" | "random" })
                }
              >
                <TabsList className="w-full">
                  <TabsTrigger value="equal">Equal</TabsTrigger>
                  <TabsTrigger value="random">Random</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <DimInput
                  label="Columns"
                  value={state.cols}
                  onChange={(n) => dispatch({ type: "SET_COLS", cols: n })}
                />
              </div>
              <div className="flex-1">
                <DimInput
                  label="Rows"
                  value={state.rows}
                  onChange={(n) => dispatch({ type: "SET_ROWS", rows: n })}
                />
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={state.mode !== "random"}
              onClick={() => dispatch({ type: "REROLL" })}
            >
              <Shuffle /> Re-roll
            </Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="canvas">
          <AccordionTrigger>Canvas</AccordionTrigger>
          <AccordionContent className="space-y-4">
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
                  <TabsTrigger value="lr">Landscape</TabsTrigger>
                  <TabsTrigger value="tb">Portrait</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="export">
          <AccordionTrigger>Export</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <ExportControls
              size={state.exportSize}
              onSize={(n) => dispatch({ type: "SET_EXPORT_SIZE", size: n })}
              format={format}
              onFormat={(f) => setFormat(f)}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="pt-4">
        <Button onClick={() => exportImage(format)} disabled={!bothReady} className="w-full">
          <Download /> Export
        </Button>
      </div>
    </div>
  );
}
