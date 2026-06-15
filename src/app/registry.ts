import type { FC, ReactNode } from "react";
import { PlaceholderControls, PlaceholderPreview } from "../generators/placeholder/PlaceholderGenerator";

export type Generator = {
  id: string;
  name: string;
  Preview: FC;
  Controls: FC;
  Provider?: FC<{ children: ReactNode }>;
};

export const registry: Generator[] = [
  {
    id: "placeholder",
    name: "Placeholder",
    Preview: PlaceholderPreview,
    Controls: PlaceholderControls,
  },
];
