// src/generators/grid-reveal/index.ts
import { Grid3x3 } from "lucide-react";
import type { Generator } from "@/app/registry";
import { GridRevealControls } from "./GridRevealControls";
import { GridRevealPreview } from "./GridRevealPreview";
import { GridRevealProvider } from "./GridRevealProvider";

export const gridRevealGenerator: Generator = {
  id: "grid-reveal",
  name: "Grid Reveal",
  icon: Grid3x3,
  Preview: GridRevealPreview,
  Controls: GridRevealControls,
  Provider: GridRevealProvider,
};
