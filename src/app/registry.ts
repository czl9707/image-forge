import type { FC, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
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
  swapCollageGenerator,
];
