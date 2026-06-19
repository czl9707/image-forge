// src/generators/swap-collage/SwapCollageControls.tsx
import { useRef, useState, type ChangeEvent } from "react";
import {
  Columns2,
  Download,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  Rows2,
  Square,
  Trash2,
} from "lucide-react";
import { useSwapCollage } from "./SwapCollageProvider";
import { type ExportFormat } from "@/export";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AspectId, Orientation } from "./swapReducer";

function SlotRow({
  label,
  status,
  error,
  onReplace,
  onClear,
}: {
  label: string;
  status: string;
  error: string | null;
  onReplace: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {status === "ready" ? "loaded" : status === "error" ? error ?? "error" : status}
        </span>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onReplace}>
          Replace
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <Trash2 /> Clear
        </Button>
      </div>
    </div>
  );
}

export function SwapCollageControls() {
  const { imgA, imgB, loadImage, clearImage, state, dispatch, exportImage } =
    useSwapCollage();
  const [format, setFormat] = useState<ExportFormat>("png");
  const fileA = useRef<HTMLInputElement>(null);
  const fileB = useRef<HTMLInputElement>(null);

  const bothReady = imgA.status === "ready" && imgB.status === "ready";

  const onPick = (slot: "A" | "B") => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadImage(slot, f);
    e.target.value = "";
  };

  const onExport = () => exportImage(format);

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-auto p-4">
      <SlotRow
        label="Image A"
        status={imgA.status}
        error={imgA.error}
        onReplace={() => fileA.current?.click()}
        onClear={() => clearImage("A")}
      />
      <input ref={fileA} type="file" accept="image/*" hidden onChange={onPick("A")} />

      <SlotRow
        label="Image B"
        status={imgB.status}
        error={imgB.error}
        onReplace={() => fileB.current?.click()}
        onClear={() => clearImage("B")}
      />
      <input ref={fileB} type="file" accept="image/*" hidden onChange={onPick("B")} />

      <div className="flex flex-col gap-2">
        <Label>Orientation</Label>
        <Tabs
          value={state.orientation}
          onValueChange={(v) =>
            dispatch({
              type: "SET_ORIENTATION",
              orientation: v as Orientation,
            })
          }
        >
          <TabsList>
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
        <Label>Aspect</Label>
        <Tabs
          value={state.aspect}
          onValueChange={(v) =>
            dispatch({ type: "SET_ASPECT", aspect: v as AspectId })
          }
        >
          <TabsList>
            <TabsTrigger value="square">
              <Square /> Square
            </TabsTrigger>
            <TabsTrigger value="landscape">
              <RectangleHorizontal /> 16:9
            </TabsTrigger>
            <TabsTrigger value="portrait">
              <RectangleVertical /> 9:16
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Export size</Label>
        <Select
          value={String(state.exportSize)}
          onValueChange={(v) =>
            dispatch({ type: "SET_EXPORT_SIZE", size: Number(v) })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1080">1080px</SelectItem>
            <SelectItem value="2160">2160px</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Format</Label>
        <Tabs value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
          <TabsList>
            <TabsTrigger value="png">PNG</TabsTrigger>
            <TabsTrigger value="jpg">JPG</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => dispatch({ type: "RESET_MASK" })}
      >
        <RotateCcw /> Reset mask
      </Button>

      <Button onClick={onExport} disabled={!bothReady}>
        <Download /> Export
      </Button>
    </div>
  );
}
