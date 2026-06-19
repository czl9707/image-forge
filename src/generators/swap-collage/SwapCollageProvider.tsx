// src/generators/swap-collage/SwapCollageProvider.tsx
import {
  createContext,
  useContext,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
  type RefObject,
} from "react";
import type Konva from "konva";
import { exportStage, type ExportFormat } from "@/export";
import { useImageBitmap, type ImgStatus } from "@/hooks/useImageBitmap";
import {
  initialSwapState,
  swapReducer,
  type AspectId,
  type Mask,
  type Orientation,
  type Selection,
  type Slot,
  type SwapAction,
  type SwapState,
  type Transform,
} from "./swapReducer";

export interface ImageSlot {
  bitmap: ImageBitmap | null;
  name: string | null;
  status: ImgStatus;
  error: string | null;
}

export interface SwapContextValue {
  imgA: ImageSlot;
  imgB: ImageSlot;
  loadImage: (slot: Slot, file: File) => Promise<void>;
  clearImage: (slot: Slot) => void;
  state: SwapState;
  dispatch: Dispatch<SwapAction>;
  stageRef: RefObject<Konva.Stage | null>;
  exportImage: (format: ExportFormat) => void;
}

const SwapContext = createContext<SwapContextValue | null>(null);

export function SwapCollageProvider({ children }: { children: ReactNode }) {
  const a = useImageBitmap();
  const b = useImageBitmap();
  const [state, dispatch] = useReducer(swapReducer, initialSwapState);
  const stageRef = useRef<Konva.Stage | null>(null);

  const loadImage = (slot: Slot, file: File) =>
    slot === "A" ? a.load(file) : b.load(file);
  const clearImage = (slot: Slot) =>
    slot === "A" ? a.reset() : b.reset();

  const exportImage = (format: ExportFormat) => {
    const stage = stageRef.current;
    if (!stage) return;
    // Hide selection handles + mask guide for the snapshot so the file is
    // chrome-free, then restore. exportStage rasterizes synchronously before its
    // first await, and nothing repaints the stage during the async blob work, so
    // restoring on settle never flickers on screen.
    const overlays = stage.find<Konva.Node>(".overlay");
    const prior = overlays.map((n) => n.visible());
    overlays.forEach((n) => n.visible(false));
    exportStage(stage, format).finally(() =>
      overlays.forEach((n, i) => n.visible(prior[i])),
    );
  };

  const value: SwapContextValue = {
    imgA: { bitmap: a.bitmap, name: a.name, status: a.status, error: a.error },
    imgB: { bitmap: b.bitmap, name: b.name, status: b.status, error: b.error },
    loadImage,
    clearImage,
    state,
    dispatch,
    stageRef,
    exportImage,
  };

  return <SwapContext.Provider value={value}>{children}</SwapContext.Provider>;
}

export function useSwapCollage(): SwapContextValue {
  const ctx = useContext(SwapContext);
  if (!ctx) {
    throw new Error("useSwapCollage must be used within SwapCollageProvider");
  }
  return ctx;
}

export type {
  AspectId,
  Mask,
  Orientation,
  Selection,
  Slot,
  SwapAction,
  SwapState,
  Transform,
};
