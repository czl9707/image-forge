// src/lib/canvas/fit.ts
export interface Fit {
  scale: number;
  x: number;
  y: number;
}

/**
 * Cover-fit: scale an (iw × ih) image so it fully covers a (boxW × boxH) box,
 * centered. Returns the uniform scale and the centered top-left position.
 */
export function coverFit(
  iw: number,
  ih: number,
  boxW: number,
  boxH: number,
): Fit {
  const scale = Math.max(boxW / iw, boxH / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  return { scale, x: (boxW - drawW) / 2, y: (boxH - drawH) / 2 };
}
