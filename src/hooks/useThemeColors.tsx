// src/hooks/useThemeColors.tsx
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";

/**
 * Theme color tokens resolved to rgb() strings, for canvas/Konva fills where
 * raw oklch CSS vars are unreliable. Values come from a single hidden sentinel
 * wearing the matching Tailwind utility classes, so they track light/dark.
 *
 * To add a token: add the key to {@link ThemeColors} (as `string`) AND a row to
 * {@link TOKENS} with its Tailwind class and which computed style to read.
 */
export interface ThemeColors {
  /** `text-muted-foreground` — secondary text and placeholder outlines. */
  mutedForeground: string;
  /** `text-primary` — primary foreground (high contrast; highlight strokes). */
  primary: string;
  /** `bg-background` — the app / canvas background fill. */
  background: string;
}

/** One token to read off the sentinel. Add rows here to extend the palette. */
const TOKENS = [
  { key: "mutedForeground", className: "text-muted-foreground", read: "color" },
  { key: "primary", className: "text-primary", read: "color" },
  { key: "background", className: "bg-background", read: "backgroundColor" },
] as const satisfies readonly {
  key: keyof ThemeColors;
  className: string;
  read: "color" | "backgroundColor";
}[];

const EMPTY_COLORS: ThemeColors = {
  mutedForeground: "",
  primary: "",
  background: "",
};

const ThemeColorsContext = createContext<ThemeColors | null>(null);

/**
 * Mounts one hidden sentinel wearing every token's Tailwind class and exposes
 * the resolved colors via {@link useThemeColors}. Mount it once near the app
 * root (inside `ThemeProvider`, since it depends on `resolvedTheme`). Every
 * consumer then shares the single sentinel — no per-component DOM nodes.
 */
export function ThemeColorsProvider({ children }: { children: ReactNode }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<ThemeColors>(EMPTY_COLORS);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const next = { ...EMPTY_COLORS };
    for (const token of TOKENS) {
      const node = el.querySelector(`.${token.className}`);
      if (!node) continue;
      next[token.key] = (getComputedStyle(node) as unknown as Record<string, string>)[
        token.read
      ];
    }
    setColors(next);
  }, [resolvedTheme]);

  return (
    <ThemeColorsContext.Provider value={colors}>
      {children}
      {/* Sentinel: one hidden node wearing each token's class so getComputedStyle
          resolves the theme color into an rgb() string canvas can consume. */}
      <div
        ref={sentinelRef}
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      >
        {TOKENS.map((token) => (
          <span key={token.key} className={token.className} />
        ))}
      </div>
    </ThemeColorsContext.Provider>
  );
}

/** Resolved theme colors for canvas/Konva fills. Must be used inside
 *  {@link ThemeColorsProvider}. Returns empty strings until first resolve. */
export function useThemeColors(): ThemeColors {
  const ctx = useContext(ThemeColorsContext);
  if (!ctx) {
    throw new Error("useThemeColors must be used within <ThemeColorsProvider>");
  }
  return ctx;
}
