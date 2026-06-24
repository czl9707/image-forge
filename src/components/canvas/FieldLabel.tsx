// src/components/canvas/FieldLabel.tsx
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/** A control label: smaller and lighter than an accordion section title, to
 *  keep a clear visual hierarchy (section > control > value). */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Label className="text-xs font-normal text-muted-foreground">
      {children}
    </Label>
  );
}
