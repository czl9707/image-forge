// src/components/filters/FilterStackControls.tsx
import { useState } from "react";
import { GripVertical, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addFilter,
  amountOf,
  COLORIZE_HUE,
  COLORIZE_SAT,
  KIND_META,
  moveFilter,
  removeFilter,
  toggleFilter,
  updateFilter,
  withAmount,
  type FilterInstance,
  type FilterKind,
  type FilterStack,
} from "@/lib/filters";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `f-${Math.random().toString(36).slice(2)}`;
}

/** All addable kinds, always available (duplicates allowed). */
const ALL_KINDS = Object.keys(KIND_META) as FilterKind[];

/** A row. `make` applies a stack-transforming fn to the real current stack and
 *  propagates the result via onChange. */
function Row({
  f,
  index,
  make,
}: {
  f: FilterInstance;
  index: number;
  make: (fn: (real: FilterStack) => FilterStack) => void;
}) {
  const meta = KIND_META[f.kind];
  const [dragging, setDragging] = useState(false);

  const isHue = f.kind === "hue";
  const hueF = f as Extract<FilterInstance, { kind: "hue" }>;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border p-2",
        !f.enabled && "opacity-50",
        dragging && "opacity-40",
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData("text/plain"));
        make((real) => moveFilter(real, from, index));
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Drag ${meta.label}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", String(index));
            setDragging(true);
          }}
          onDragEnd={() => setDragging(false)}
          className="cursor-grab text-muted-foreground"
        >
          <GripVertical className="size-4" />
        </button>
        <Label className="flex-1 text-xs font-medium">{meta.label}</Label>
        <Switch
          aria-label={`Toggle ${meta.label}`}
          checked={f.enabled}
          onCheckedChange={() => make((real) => toggleFilter(real, f.id))}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove filter"
          onClick={() => make((real) => removeFilter(real, f.id))}
        >
          <X className="size-4" />
        </Button>
      </div>

      {isHue && (
        <div className="flex items-center gap-2 pl-6">
          <Switch
            aria-label="Colorize"
            checked={hueF.colorize}
            onCheckedChange={(v) => make((real) => updateFilter(real, f.id, { colorize: v }))}
          />
          <Label className="text-xs text-muted-foreground">Colorize</Label>
        </div>
      )}

      {isHue && hueF.colorize ? (
        <div className="flex flex-col gap-2 pl-6">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Hue</Label>
            <span className="text-xs text-muted-foreground">{Math.round(hueF.colorHue)}°</span>
          </div>
          <Slider
            value={[hueF.colorHue]}
            min={COLORIZE_HUE.min}
            max={COLORIZE_HUE.max}
            step={COLORIZE_HUE.step}
            onValueChange={([v]) => make((real) => updateFilter(real, f.id, { colorHue: v }))}
          />
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Saturation</Label>
            <span className="text-xs text-muted-foreground">{hueF.colorSat.toFixed(2)}</span>
          </div>
          <Slider
            value={[hueF.colorSat]}
            min={COLORIZE_SAT.min}
            max={COLORIZE_SAT.max}
            step={COLORIZE_SAT.step}
            onValueChange={([v]) => make((real) => updateFilter(real, f.id, { colorSat: v }))}
          />
        </div>
      ) : (
        <Slider
          value={[amountOf(f)]}
          min={meta.min}
          max={meta.max}
          step={meta.step}
          onValueChange={([v]) =>
            make((real) => real.map((x) => (x.id === f.id ? withAmount(x, v) : x)))
          }
        />
      )}
    </div>
  );
}

export function FilterStackControls({
  stack,
  onChange,
  disabled,
}: {
  stack: FilterStack;
  onChange: (next: FilterStack) => void;
  disabled?: boolean;
}) {
  const make = (fn: (real: FilterStack) => FilterStack) => {
    if (disabled) return;
    onChange(fn(stack));
  };

  return (
    <div className="flex flex-col gap-2">
      {stack.length === 0 && (
        <p className="text-xs text-muted-foreground">No filters yet — add one.</p>
      )}

      {stack.map((f, i) => (
        <Row key={f.id} f={f} index={i} make={make} />
      ))}

      <Select
        value=""
        disabled={disabled}
        onValueChange={(kind) => {
          if (!kind || disabled) return;
          onChange(addFilter(stack, kind as FilterKind, newId()));
        }}
      >
        <SelectTrigger className="w-full" aria-label="Add filter">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Plus className="size-4" /> Add filter
          </span>
        </SelectTrigger>
        {/* position="popper" is required: this Select has no selected value
            (value=""), and the default "item-aligned" mode positions the
            content relative to a selected item — with none, the dropdown
            renders off the visible area. Popper anchors it to the trigger. */}
        <SelectContent position="popper" sideOffset={4}>
          {ALL_KINDS.map((k) => (
            <SelectItem key={k} value={k}>
              {KIND_META[k].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        disabled={disabled}
        onClick={() => onChange([])}
      >
        <RotateCcw className="size-4" /> Reset filters
      </Button>
    </div>
  );
}
