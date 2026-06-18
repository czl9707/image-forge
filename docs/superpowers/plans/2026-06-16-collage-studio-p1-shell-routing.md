# Collage Studio — P1 App Shell & Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full structural skeleton built **on the shadcn sidebar-15 template** (not homebrewed) — the inset layout (left nav / center canvas / right ops), react-router URL routing per generator, a dummy Konva canvas in the center, and a dark/light theme toggle in the header — with **no generator functionality** (every functional slot is a placeholder).

**Guiding principle:** *Follow the template, change the content.* The shadcn sidebar-15 block components and `ui/sidebar.tsx` primitives are the layout source of truth. We reuse `NavMain` / `NavSecondary` and the `Sidebar*` primitives, swap in Collage-Studio data, and add theming — we do not hand-roll a parallel sidebar implementation.

**Architecture:** A single `StudioShell` component reads the `:genId` route param, looks the generator up in `registry`, and wraps the whole shell in the generator's `Provider` (so state reaches both center and right panel). Inside, `SidebarProvider` lays out three flex siblings: `SidebarLeft` (brand + registry-driven nav via `NavMain`/`NavSecondary`), `SidebarInset` (a minor header = `SidebarTrigger` + breadcrumb + `ModeToggle`, then the generator's `Preview`), and a **static** `SidebarRight` (`collapsible="none"`, always visible on desktop) hosting the generator's `Controls`. `react-router` (`BrowserRouter` in `main.tsx`) maps `/` → first generator, `/:genId` → `StudioShell`, `*` → first generator. `next-themes` (`ThemeProvider` in `main.tsx`, `attribute="class"`, `defaultTheme="system"`) resolves the initial appearance from the OS; the header `ModeToggle` is a single button that flips only between `light` and `dark`. The placeholder generator's `Preview` becomes a dummy Konva `<Stage>` to prove the canvas stack.

**Tech Stack:** Vite + React 19 + TypeScript, Tailwind v4 + shadcn/ui (sidebar-15 block), **react-router** (routing), **konva + react-konva** (dummy canvas), **next-themes** (theming — already a dependency; CSS `.dark` vars already defined), vitest + @testing-library/react + jsdom.

**Reference spec:** `docs/superpowers/specs/2026-06-16-collage-studio-design-v2.md` (sections 3.2, 3.3, 10 P1). Deviation, by decision: the right ops sidebar is **static** (template default) rather than header-toggleable as spec §3.2 floated.

---

## Prerequisite

We are already on branch `feat/collage-studio-p1-shell-routing` (off `130cdac`, which includes P0 + the v2 design). If executing via subagent-driven-development, it manages the worktree/branch; otherwise continue on this branch.

## File Structure (this phase)

- **Modify:** `package.json` — add `react-router`, `konva`, `react-konva`. (`next-themes` is already present.)
- **Modify:** `src/app/registry.ts` — add optional `icon?: LucideIcon`; give the placeholder an icon.
- **Modify:** `src/components/nav-main.tsx` — switch `<a href>` → `<NavLink>` (SPA routing); `isActive` stays prop-driven.
- **Modify:** `src/test/setup.ts` — add `matchMedia` + `react-konva` test mocks.
- **Rewrite:** `src/components/sidebar-left.tsx` — template composition, Collage-Studio content (`variant="inset"`).
- **Rewrite:** `src/components/sidebar-right.tsx` — static `Controls` host (`collapsible="none"`).
- **Modify:** `src/generators/placeholder/PlaceholderGenerator.tsx` — `PlaceholderPreview` becomes a dummy Konva `<Stage>`.
- **Create:** `src/components/theme-provider.tsx` — thin re-export of `next-themes` `ThemeProvider`.
- **Create:** `src/components/mode-toggle.tsx` — single light/dark toggle button (reads `resolvedTheme`).
- **Create:** `src/app/StudioShell.tsx` — the sidebar-15 inset layout, reads `:genId`.
- **Rewrite:** `src/app/App.tsx` — the `<Routes>` table (was the hand-rolled 3-column shell).
- **Modify:** `src/main.tsx` — wrap `<App/>` in `<ThemeProvider>` + `<BrowserRouter>`.
- **Tests:** `src/components/__tests__/sidebar-left.test.tsx`, `sidebar-right.test.tsx`, `mode-toggle.test.tsx`, `src/generators/placeholder/__tests__/PlaceholderGenerator.test.tsx`, `src/app/__tests__/StudioShell.test.tsx`; **rewrite** `src/app/__tests__/App.test.tsx`.

> Note: the imported block's now-unused demo components (`team-switcher`, `nav-favorites`, `nav-workspaces`, `nav-user`, `calendars`, `date-picker`) are no longer imported after the rewrites. They are harmless dead files; deleting them is an optional cleanup, **not** part of acceptance. (`nav-main` and `nav-secondary` are kept and reused.)

---

### Task 1: Install routing + canvas dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

> `next-themes` is already a dependency (used by `ui/sonner.tsx`); it needs no install. Only routing + canvas are new.

- [ ] **Step 1: Install the libraries**

```bash
npm install react-router konva react-konva
```

`react-router` (v7, unified package — import from `"react-router"`), `konva` (v9), `react-konva` (v19, matches React 19). Both ship their own TypeScript types — no `@types/*` needed.

- [ ] **Step 2: Verify the install resolves and the app still boots**

Run: `npm run build`
Expected: build succeeds (the new deps are not yet imported, so behavior is unchanged).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(p1): add react-router, konva, react-konva"
```

---

### Task 2: Test infrastructure — `matchMedia` + `react-konva` mocks

The shadcn `Sidebar` reads `window.matchMedia` (mobile detection) and the placeholder renders a Konva `<Stage>` — neither works in jsdom. Add both mocks to the global test setup so every component test runs headless.

**Files:**
- Modify: `src/test/setup.ts`

- [ ] **Step 1: Replace `src/test/setup.ts` with the mocked setup**

```ts
// src/test/setup.ts
import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// jsdom does not implement matchMedia; the shadcn Sidebar (useIsMobile) and
// next-themes (system theme resolution) both read it. Desktop + "light" default.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Konva needs a real canvas, which jsdom does not provide. Replace react-konva's
// primitives with plain divs so component tests can render the shell without canvas.
vi.mock("react-konva", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const mockEl = (testId: string) =>
    React.forwardRef<HTMLDivElement, { children?: React.ReactNode; text?: string }>(
      (props, ref) =>
        React.createElement(
          "div",
          { ref, "data-testid": testId },
          props.children ?? props.text ?? null,
        ),
    );
  return {
    Stage: mockEl("konva-stage"),
    Layer: mockEl("konva-layer"),
    Rect: mockEl("konva-rect"),
    Text: mockEl("konva-text"),
    Image: mockEl("konva-image"),
    Line: mockEl("konva-line"),
    Group: mockEl("konva-group"),
  };
});
```

- [ ] **Step 2: Verify the existing suite is still green (mocks are inert until used)**

Run: `npm test`
Expected: PASS — `registry` (3) + `App shell` (3) all pass; no regressions.

- [ ] **Step 3: Commit**

```bash
git add src/test/setup.ts
git commit -m "test(p1): mock matchMedia and react-konva in test setup"
```

---

### Task 3: Theming primitives — `theme-provider` + `mode-toggle` (TDD)

`next-themes` is present but not wired. Add the two standard shadcn files. The toggle is a **single button** — it reads `resolvedTheme` (so the icon and starting state follow the OS via `defaultTheme="system"`) and `setTheme` only ever flips between `"light"` and `"dark"` (no dropdown, no "system" option in the UI).

**Files:**
- Create: `src/components/theme-provider.tsx`
- Create: `src/components/mode-toggle.tsx`
- Test: `src/components/__tests__/mode-toggle.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/mode-toggle.test.tsx
import { describe, expect, it, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../theme-provider";
import { ModeToggle } from "../mode-toggle";

afterEach(() => {
  document.documentElement.classList.remove("dark", "light");
  // next-themes persists the chosen theme to localStorage; clear it so tests
  // don't bleed state into each other.
  localStorage.clear();
});

describe("ModeToggle", () => {
  it("renders a single toggle button", () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <ModeToggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });

  it("flips light → dark on click (toggles the .dark class on <html>)", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <ModeToggle />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/mode-toggle.test.tsx`
Expected: FAIL — "Cannot find module '../theme-provider'" / "'../mode-toggle'".

- [ ] **Step 3: Create `src/components/theme-provider.tsx`**

```tsx
// src/components/theme-provider.tsx
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 4: Create `src/components/mode-toggle.tsx`**

```tsx
// src/components/mode-toggle.tsx
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ModeToggle({ className }: { className?: string }) {
  // resolvedTheme reflects the OS/system theme until the user picks one, so the
  // icon + starting appearance follow the system. The button only flips light/dark.
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/mode-toggle.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/theme-provider.tsx src/components/mode-toggle.tsx src/components/__tests__/mode-toggle.test.tsx
git commit -m "feat(p1): theme-provider + light/dark mode-toggle button"
```

---

### Task 4: `SidebarLeft` — template composition with Collage-Studio content (TDD)

Reuse the block's `NavMain` / `NavSecondary` components, fed from `registry`. Two small, justified touches: the registry gains an optional `icon`; and `NavMain` switches its inner element from `<a href>` to `<NavLink>` so navigation is client-side (its `isActive` prop stays the source of active styling, computed from the route in `SidebarLeft`).

**Files:**
- Modify: `src/app/registry.ts`
- Modify: `src/components/nav-main.tsx`
- Rewrite: `src/components/sidebar-left.tsx`
- Test: `src/components/__tests__/sidebar-left.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/sidebar-left.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarLeft } from "../sidebar-left";
import { registry } from "@/app/registry";

function renderLeft() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <SidebarLeft />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("SidebarLeft", () => {
  it("renders a nav link to each registry generator", () => {
    renderLeft();
    for (const g of registry) {
      expect(screen.getByRole("link", { name: g.name })).toHaveAttribute(
        "href",
        `/${g.id}`,
      );
    }
  });

  it("shows the Collage Studio brand", () => {
    renderLeft();
    expect(screen.getByText("Collage Studio")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/sidebar-left.test.tsx`
Expected: FAIL — the current `SidebarLeft` renders sample data ("Acme Inc" / favorites / workspaces), not registry links or "Collage Studio".

- [ ] **Step 3: Add optional `icon` to the registry**

```ts
// src/app/registry.ts
import type { FC, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Layers } from "lucide-react";
import {
  PlaceholderControls,
  PlaceholderPreview,
} from "../generators/placeholder/PlaceholderGenerator";

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
];
```

- [ ] **Step 4: Switch `NavMain` to `NavLink` (keep `isActive` prop-driven)**

```tsx
// src/components/nav-main.tsx
import { NavLink } from "react-router";
import { type LucideIcon } from "lucide-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon: LucideIcon
    isActive?: boolean
  }[]
}) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild isActive={item.isActive}>
            <NavLink to={item.url}>
              <item.icon />
              <span>{item.title}</span>
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
```

> Only the inner element changed: `<a href={item.url}>` → `<NavLink to={item.url}>`. Everything else is the template verbatim. `SidebarMenuButton`'s `isActive` still drives active styling (computed in `SidebarLeft` from the route); `NavLink` provides client-side navigation.

- [ ] **Step 5: Rewrite `src/components/sidebar-left.tsx`**

```tsx
// src/components/sidebar-left.tsx
import * as React from "react";
import { useLocation } from "react-router";
import { Layers, LifeBuoy, Settings2 } from "lucide-react";

import { registry } from "@/app/registry";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

const navSecondary = [
  { title: "Settings", url: "#", icon: Settings2 },
  { title: "Help", url: "#", icon: LifeBuoy },
];

export function SidebarLeft({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation();

  const items = registry.map((g) => ({
    title: g.name,
    url: `/${g.id}`,
    icon: g.icon ?? Layers,
    isActive: pathname === `/${g.id}`,
  }));

  return (
    <Sidebar variant="inset" collapsible="icon" className="border-r-0" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Layers className="size-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Collage Studio</span>
            <span className="text-xs text-muted-foreground">
              Image generators
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/sidebar-left.test.tsx`
Expected: PASS (2 tests). The existing `registry.test.ts` stays green (it asserts ids/names/length, unaffected by the added optional `icon`).

- [ ] **Step 7: Commit**

```bash
git add src/app/registry.ts src/components/nav-main.tsx src/components/sidebar-left.tsx src/components/__tests__/sidebar-left.test.tsx
git commit -m "feat(p1): registry-driven SidebarLeft via NavMain/NavSecondary"
```

---

### Task 5: `SidebarRight` — static `Controls` host (TDD)

Template shell, `collapsible="none"`, always visible on desktop (hidden below `lg`). Renders its children as the operations content. No toggle — static, per decision.

**Files:**
- Test: `src/components/__tests__/sidebar-right.test.tsx`
- Rewrite: `src/components/sidebar-right.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/sidebar-right.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarRight } from "../sidebar-right";

describe("SidebarRight", () => {
  it("renders its children as the operations content", () => {
    render(
      <MemoryRouter>
        <SidebarProvider>
          <SidebarRight>
            <div>ops content</div>
          </SidebarRight>
        </SidebarProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("ops content")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/__tests__/sidebar-right.test.tsx`
Expected: FAIL — the current `SidebarRight` renders sample calendars/date-picker/nav-user, not arbitrary children.

- [ ] **Step 3: Rewrite `src/components/sidebar-right.tsx`**

```tsx
// src/components/sidebar-right.tsx
import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";

export function SidebarRight({
  children,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 hidden h-svh border-l border-sidebar-border lg:flex"
      {...props}
    >
      <SidebarContent>{children}</SidebarContent>
    </Sidebar>
  );
}
```

> `collapsible="none"` short-circuits to a plain full-height column of `--sidebar-width` (16rem). The `hidden … lg:flex` mirrors the block's desktop-only visibility. Class set is the template's own; adjust in the smoke step only if the panel mis-sizes inside the inset row.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/sidebar-right.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar-right.tsx src/components/__tests__/sidebar-right.test.tsx
git commit -m "feat(p1): SidebarRight as static Controls host"
```

---

### Task 6: Dummy Konva canvas in `PlaceholderPreview` (TDD)

**Files:**
- Test: `src/generators/placeholder/__tests__/PlaceholderGenerator.test.tsx`
- Modify: `src/generators/placeholder/PlaceholderGenerator.tsx`

> Keep the canvas label text as `"Preview area"` (the `StudioShell` and `App` tests assert it).

- [ ] **Step 1: Write the failing test**

```tsx
// src/generators/placeholder/__tests__/PlaceholderGenerator.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaceholderControls, PlaceholderPreview } from "../PlaceholderGenerator";

describe("PlaceholderPreview", () => {
  it("renders a Konva stage", () => {
    render(<PlaceholderPreview />);
    expect(screen.getByTestId("konva-stage")).toBeInTheDocument();
  });

  it("shows a placeholder label", () => {
    render(<PlaceholderPreview />);
    expect(screen.getByText("Preview area")).toBeInTheDocument();
  });
});

describe("PlaceholderControls", () => {
  it("renders the operations label", () => {
    render(<PlaceholderControls />);
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/generators/placeholder/__tests__/PlaceholderGenerator.test.tsx`
Expected: FAIL — `PlaceholderPreview` renders a `<div>`, not a Konva stage (`getByTestId("konva-stage")` not found).

- [ ] **Step 3: Implement the dummy stage**

```tsx
// src/generators/placeholder/PlaceholderGenerator.tsx
import { Layer, Rect, Stage, Text } from "react-konva";

const CANVAS_W = 720;
const CANVAS_H = 540;

export function PlaceholderPreview() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Stage width={CANVAS_W} height={CANVAS_H}>
        <Layer>
          <Rect
            x={0}
            y={0}
            width={CANVAS_W}
            height={CANVAS_H}
            stroke="#94a3b8"
            dash={[8, 6]}
          />
          <Text
            text="Preview area"
            x={0}
            y={CANVAS_H / 2 - 12}
            width={CANVAS_W}
            align="center"
            fontSize={20}
            fill="#94a3b8"
          />
        </Layer>
      </Stage>
    </div>
  );
}

export function PlaceholderControls() {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-4 text-muted-foreground">
      Operations
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/generators/placeholder/__tests__/PlaceholderGenerator.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/generators/placeholder/PlaceholderGenerator.tsx src/generators/placeholder/__tests__/PlaceholderGenerator.test.tsx
git commit -m "feat(p1): dummy Konva stage as placeholder preview"
```

---

### Task 7: `StudioShell` — the sidebar-15 inset layout (TDD)

The generator `Provider` wraps the entire `SidebarProvider` so shared state reaches both the center `Preview` and the right `Controls`. Inside `SidebarProvider`, three flex siblings: `SidebarLeft` (inset), `SidebarInset` (minor header + canvas), `SidebarRight` (static, last child). The minor header holds the left `SidebarTrigger`, a breadcrumb, and the `ModeToggle`. **No right-panel toggle.**

**Files:**
- Test: `src/app/__tests__/StudioShell.test.tsx`
- Create: `src/app/StudioShell.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/__tests__/StudioShell.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { StudioShell } from "../StudioShell";
import { registry } from "../registry";

function renderShellAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StudioShell />
    </MemoryRouter>,
  );
}

describe("StudioShell", () => {
  it("shows the active generator's name in the breadcrumb", () => {
    renderShellAt("/placeholder");
    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(breadcrumb).toHaveTextContent(registry[0].name);
  });

  it("renders the active generator's Preview and Controls", () => {
    renderShellAt("/placeholder");
    expect(screen.getByText("Preview area")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("renders the theme toggle in the header", () => {
    renderShellAt("/placeholder");
    expect(
      screen.getByRole("button", { name: "Toggle theme" }),
    ).toBeInTheDocument();
  });
});
```

> `ModeToggle` uses `useTheme`, which renders fine without a `ThemeProvider` (no throw) — it just won't resolve a theme. That's enough for this render assertion; Task 8 wires the real provider.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/__tests__/StudioShell.test.tsx`
Expected: FAIL — "Cannot find module '../StudioShell'".

- [ ] **Step 3: Implement `src/app/StudioShell.tsx`**

```tsx
// src/app/StudioShell.tsx
import type { ReactNode } from "react";
import { NavLink, useParams } from "react-router";

import { registry } from "@/app/registry";
import { ModeToggle } from "@/components/mode-toggle";
import { SidebarLeft } from "@/components/sidebar-left";
import { SidebarRight } from "@/components/sidebar-right";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

function PassthroughProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function findGenerator(id?: string) {
  return registry.find((g) => g.id === id) ?? registry[0];
}

export function StudioShell() {
  const { genId } = useParams();
  const generator = findGenerator(genId);

  const Preview = generator.Preview;
  const Controls = generator.Controls;
  const Provider = generator.Provider ?? PassthroughProvider;

  return (
    <Provider>
      <SidebarProvider>
        <SidebarLeft />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild>
                    <NavLink to={`/${registry[0].id}`}>Collage Studio</NavLink>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{generator.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <ModeToggle className="ml-auto" />
          </header>

          <div className="flex flex-1 items-center justify-center overflow-auto p-4">
            <Preview />
          </div>
        </SidebarInset>

        <SidebarRight>
          <Controls />
        </SidebarRight>
      </SidebarProvider>
    </Provider>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/__tests__/StudioShell.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/StudioShell.tsx src/app/__tests__/StudioShell.test.tsx
git commit -m "feat(p1): add StudioShell sidebar-15 inset layout reading :genId"
```

---

### Task 8: Routing — `App` route table + `ThemeProvider` + `BrowserRouter` + rewrite `App.test` (TDD)

**Files:**
- Rewrite: `src/app/App.tsx` (was the hand-rolled 3-column shell)
- Rewrite: `src/app/__tests__/App.test.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/__tests__/App.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "../App";
import { registry } from "../registry";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routing + shell", () => {
  it("redirects '/' to the first generator", () => {
    renderAt("/");
    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(breadcrumb).toHaveTextContent(registry[0].name);
  });

  it("renders the active generator's preview and operations", () => {
    renderAt("/placeholder");
    expect(screen.getByText("Preview area")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("renders a nav link per registry entry", () => {
    renderAt("/placeholder");
    expect(
      screen.getAllByRole("link", { name: registry[0].name }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders the theme toggle in the header", () => {
    renderAt("/placeholder");
    expect(
      screen.getByRole("button", { name: "Toggle theme" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/__tests__/App.test.tsx`
Expected: FAIL — the current `App` is the hand-rolled shell (no breadcrumb navigation; no theme toggle; nav is buttons not links).

- [ ] **Step 3: Rewrite `src/app/App.tsx`**

```tsx
// src/app/App.tsx
import { Navigate, Route, Routes } from "react-router";
import { registry } from "./registry";
import { StudioShell } from "./StudioShell";

const firstGeneratorPath = `/${registry[0]?.id ?? ""}`;

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={firstGeneratorPath} replace />} />
      <Route path="/:genId" element={<StudioShell />} />
      <Route path="*" element={<Navigate to={firstGeneratorPath} replace />} />
    </Routes>
  );
}
```

- [ ] **Step 4: Wrap `App` in `ThemeProvider` + `BrowserRouter` in `src/main.tsx`**

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ThemeProvider } from "@/components/theme-provider";
import "./index.css";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
```

> `defaultTheme="system"` + `enableSystem` resolves the initial light/dark from the OS; the `ModeToggle` button then flips between explicit `light`/`dark`. `disableTransitionOnChange` avoids a color flash on toggle. CSS `.dark` variables already exist in `index.css`. This is a client-only Vite SPA, so `suppressHydrationWarning` on `<html>` is unnecessary (React never owns `documentElement.className`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/__tests__/App.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx src/app/__tests__/App.test.tsx src/main.tsx
git commit -m "feat(p1): route /:genId to StudioShell; wire ThemeProvider + BrowserRouter"
```

---

### Task 9: Full suite + typecheck + build + manual smoke

**Files:** none new.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all PASS — `registry` (3), `ModeToggle` (2), `SidebarLeft` (2), `SidebarRight` (1), `PlaceholderGenerator` (3), `StudioShell` (3), `App` (4).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (bundles konva + react-konva + react-router).

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`, open http://localhost:5173, then confirm:
- `/` redirects to `/placeholder`; the URL bar shows it.
- Layout (sidebar-15 inset): left nav (brand "Collage Studio" + "Placeholder" link + Settings/Help), center minor header (`SidebarTrigger` + breadcrumb "Collage Studio / Placeholder" + theme-toggle button at the right) over a dashed dummy canvas reading "Preview area", right ops panel (always visible on desktop) reading "Operations".
- The theme-toggle button flips light ↔ dark (icon Moon/Sun swaps, colors follow).
- The initial appearance follows the OS theme on first load.
- The left `SidebarTrigger` (and ⌘B) collapse the left nav to an icon rail and expand it; the inset margin adjusts.
- Clicking the "Placeholder" nav link and using browser back/forward work; refreshing at `/placeholder` deep-links correctly.
- Resize the window narrow: the right ops panel hides below `lg`; the left nav collapses to a mobile sheet via the trigger.

- [ ] **Step 5: Commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "test(p1): p1 shell-routing acceptance fixes"
```

(Skip if Steps 1–3 passed with no changes.)

---

## P1 Acceptance

- App boots in the **sidebar-15 inset layout** (left nav / minor header + center canvas / static right ops) built from the shadcn template components — not homebrewed.
- **react-router** drives URLs: `/` redirects to the first generator; `/:genId` renders `StudioShell`; deep-linking + back/forward work.
- Left nav links are built from `registry` (via `NavMain`); breadcrumb reflects the active generator.
- A **dummy Konva `<Stage>`** renders in the center (canvas stack proven).
- **Dark/light theming** works: initial appearance follows the OS (`defaultTheme="system"`); the header button toggles light ↔ dark.
- Right ops panel is **static** (visible on desktop, hidden below `lg`); there is no right-panel toggle.
- `npm test` green; `tsc --noEmit` clean; `npm run build` succeeds.

## Handoff to P2

P2 (separate plan) populates the swap-collage generator: installs nothing new for routing/theming, adds the pure `geometry`/`fit` helpers + tests, `SwapCollageProvider`/`Preview`/`Controls`, the on-canvas mask (Konva `Rect` + `Transformer`), and export via `stage.toCanvas`, and appends the `swap-collage` entry to `registry` (→ `/swap-collage`). The shell, routing, theming, and test mocks from P1 are reused unchanged.
