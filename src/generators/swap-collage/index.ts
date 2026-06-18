// src/generators/swap-collage/index.ts
import type { Generator } from "@/app/registry";
import { Images } from "lucide-react";
import { SwapCollageControls } from "./SwapCollageControls";
import { SwapCollagePreview } from "./SwapCollagePreview";
import { SwapCollageProvider } from "./SwapCollageProvider";

export const swapCollageGenerator: Generator = {
  id: "swap-collage",
  name: "Swap Collage",
  icon: Images,
  Preview: SwapCollagePreview,
  Controls: SwapCollageControls,
  Provider: SwapCollageProvider,
};
