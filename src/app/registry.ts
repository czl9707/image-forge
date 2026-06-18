import type { FC, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Layers } from "lucide-react";
import {
  PlaceholderControls,
  PlaceholderPreview,
} from "../generators/placeholder/PlaceholderGenerator";
import { swapCollageGenerator } from "../generators/swap-collage";

export type Generator = {
  id: string;
  name: string;
  icon?: LucideIcon;
  Preview: FC;
  Controls: FC;
  Provider?: FC<{ children: ReactNode }>;
};

export const registry: Generator[] = [
  {
    id: "placeholder",
    name: "Placeholder",
    icon: Layers,
    Preview: PlaceholderPreview,
    Controls: PlaceholderControls,
  },
  swapCollageGenerator,
];
