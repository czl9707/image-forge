// src/generators/grid-reveal/GridRevealProvider.tsx
import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
} from "react";
import type Konva from "konva";
import { exportStage, type ExportFormat } from "@/export";
import { useImageBitmap, type ImgStatus } from "@/hooks/useImageBitmap";
import {
  gridRevealReducer,
  initialGridRevealState,
  type AspectId,
  type GridMode,
  type GridRevealAction,
  type GridRevealState,
  type Orientation,
  type Slot,
} from "./gridRevealReducer";
import type { Transform } from "./layout";

export interface ImageSlot {
  bitmap: ImageBitmap | null;
  name: string | null;
  status: ImgStatus;
  error: string | null;
}

export interface GridRevealContextValue {
  imgTop: ImageSlot;
  imgBottom: ImageSlot;
  loadImage: (slot: Slot, file: File) => Promise<void>;
  clearImage: (slot: Slot) => void;
  state: GridRevealState;
  dispatch: Dispatch<GridRevealAction>;
  stageRef: RefObject<Konva.Stage | null>;
  exportImage: (format: ExportFormat) => void;
  /** Which slot a canvas drag-drop loads into (shared with the sidebar control). */
  dropTarget: Slot;
  setDropTarget: (slot: Slot) => void;
}

const GridRevealContext = createContext<GridRevealContextValue | null>(null);

export function GridRevealProvider({ children }: { children: ReactNode }) {
  const top = useImageBitmap();
  const bottom = useImageBitmap();
  const [state, dispatch] = useReducer(gridRevealReducer, initialGridRevealState);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [dropTarget, setDropTarget] = useState<Slot>("top");

  const loadImage = (slot: Slot, file: File) =>
    slot === "top" ? top.load(file) : bottom.load(file);

  const clearImage = (slot: Slot) => {
    if (slot === "top") top.reset();
    else bottom.reset();
    // Clearing an image resets its pan — no stale framing on an empty canvas.
    dispatch({ type: "RESET_XFORM", slot });
  };

  const exportImage = (format: ExportFormat) => {
    const stage = stageRef.current;
    if (!stage) return;
    // Hide the hit layer (tagged .overlay) for a chrome-free snapshot, then
    // restore. exportStage rasterizes synchronously before its first await.
    const overlays = stage.find<Konva.Node>(".overlay");
    const prior = overlays.map((n) => n.visible());
    overlays.forEach((n) => n.visible(false));
    exportStage(stage, format, "grid-reveal").finally(() =>
      overlays.forEach((n, i) => n.visible(prior[i])),
    );
  };

  const value: GridRevealContextValue = {
    imgTop: {
      bitmap: top.bitmap,
      name: top.name,
      status: top.status,
      error: top.error,
    },
    imgBottom: {
      bitmap: bottom.bitmap,
      name: bottom.name,
      status: bottom.status,
      error: bottom.error,
    },
    loadImage,
    clearImage,
    state,
    dispatch,
    stageRef,
    exportImage,
    dropTarget,
    setDropTarget,
  };

  return (
    <GridRevealContext.Provider value={value}>
      {children}
    </GridRevealContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider, matching SwapCollageProvider
export function useGridReveal(): GridRevealContextValue {
  const ctx = useContext(GridRevealContext);
  if (!ctx) {
    throw new Error("useGridReveal must be used within GridRevealProvider");
  }
  return ctx;
}

export type { AspectId, GridMode, Orientation, Slot, Transform };
