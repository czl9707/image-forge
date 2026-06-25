// src/export.ts
export type ExportFormat = "png" | "jpg";

/** Minimal slice of Konva.Stage that export needs (keeps this module testable). */
export interface ExportableStage {
  scaleX(): number;
  toCanvas(opts?: { pixelRatio?: number }): HTMLCanvasElement;
}

export async function exportStage(
  stage: ExportableStage,
  format: ExportFormat,
  prefix = "swap-collage",
): Promise<void> {
  // The on-screen stage is scaled down from the logical size; invert it so the
  // exported canvas is exactly the logical (export) resolution.
  const pixelRatio = 1 / stage.scaleX();
  const canvas = stage.toCanvas({ pixelRatio });
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const quality = format === "jpg" ? 0.92 : undefined;

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, filename(format, prefix));
      resolve();
    }, mime, quality);
  });
}

function filename(format: ExportFormat, prefix: string): string {
  return `${prefix}-${Date.now()}.${format}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
