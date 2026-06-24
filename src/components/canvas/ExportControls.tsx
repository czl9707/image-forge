// src/components/canvas/ExportControls.tsx
import type { ExportFormat } from "@/export";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FieldLabel } from "@/components/canvas/FieldLabel";

/** Export-configuration controls: output size + format. Controlled — the tool
 *  owns `size`/`format` and supplies the change callbacks. The primary Export
 *  action button is kept by the tool (it is cross-cutting, not export-config). */
export function ExportControls({
  size,
  onSize,
  format,
  onFormat,
}: {
  size: number;
  onSize: (size: number) => void;
  format: ExportFormat;
  onFormat: (format: ExportFormat) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <FieldLabel>Export size</FieldLabel>
        <Select
          value={String(size)}
          onValueChange={(v) => onSize(Number(v))}
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
        <Tabs value={format} onValueChange={(v) => onFormat(v as ExportFormat)}>
          <TabsList className="w-full">
            <TabsTrigger value="png">PNG</TabsTrigger>
            <TabsTrigger value="jpg">JPG</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </>
  );
}
