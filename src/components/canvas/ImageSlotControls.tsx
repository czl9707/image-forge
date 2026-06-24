// src/components/canvas/ImageSlotControls.tsx
import { useRef, type ChangeEvent } from "react";
import {
  AlertTriangle,
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import type { ImgStatus } from "@/hooks/useImageBitmap";
import type { FilterStack } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { FilterStackControls } from "@/components/filters/FilterStackControls";
import { FieldLabel } from "@/components/canvas/FieldLabel";

/** A single source affordance per image: empty → "Choose source", ready → the
 *  filename, error → the message. The whole bar opens the file picker (replace);
 *  the ✕ at the right edge clears. The filename/error IS the status — there is
 *  no separate status line. */
function SourceControl({
  name,
  status,
  error,
  onReplace,
  onClear,
}: {
  name: string | null;
  status: ImgStatus;
  error: string | null;
  onReplace: () => void;
  onClear: () => void;
}) {
  const busy = status === "loading";
  const ready = status === "ready";
  const isError = status === "error";
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>Source</FieldLabel>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 w-full justify-start gap-2 font-normal text-muted-foreground",
            ready && "pr-9 text-foreground",
          )}
          disabled={busy}
          onClick={onReplace}
        >
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : ready ? (
            <ImageIcon />
          ) : isError ? (
            <AlertTriangle className="text-destructive" />
          ) : (
            <Upload />
          )}
          <span className={cn("truncate", isError && "text-destructive")}>
            {ready
              ? name
              : isError
                ? error ?? "error"
                : busy
                  ? "Loading…"
                  : "Choose source"}
          </span>
        </Button>
        {ready && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
            onClick={onClear}
            aria-label="Clear source"
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

function ZoomControls({
  zoom,
  onChange,
  disabled,
}: {
  zoom: number;
  onChange: (zoom: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <FieldLabel>Zoom</FieldLabel>
        <span className="text-xs text-muted-foreground">{zoom.toFixed(2)}x</span>
      </div>
      <Slider
        value={[zoom]}
        min={1}
        max={4}
        step={0.01}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

/** One image slot's controls: source (with its own hidden file input), zoom,
 *  and filters. The tool supplies the data and callbacks; no refs are threaded
 *  in — `onPick` receives the chosen File directly. */
export function ImageSlotControls({
  name,
  status,
  error,
  zoom,
  onZoom,
  filters,
  onFilters,
  disabled,
  onPick,
  onClear,
}: {
  name: string | null;
  status: ImgStatus;
  error: string | null;
  zoom: number;
  onZoom: (zoom: number) => void;
  filters: FilterStack;
  onFilters: (filters: FilterStack) => void;
  disabled: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  // The component owns its file input so the tool never threads a ref.
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPick(f);
    e.target.value = "";
  };

  return (
    <>
      <SourceControl
        name={name}
        status={status}
        error={error}
        onReplace={() => fileRef.current?.click()}
        onClear={onClear}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPickFile}
      />
      <ZoomControls zoom={zoom} onChange={onZoom} disabled={disabled} />
      <div className="flex flex-col gap-2">
        <FieldLabel>Filters</FieldLabel>
        <FilterStackControls
          stack={filters}
          onChange={onFilters}
          disabled={disabled}
        />
      </div>
    </>
  );
}
