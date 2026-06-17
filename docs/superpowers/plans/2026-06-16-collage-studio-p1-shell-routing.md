# Collage Studio — P1 App Shell & Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full structural skeleton — the shadcn sidebar-15 inset layout (left nav / center canvas / right ops), react-router URL routing per generator, and a dummy Konva canvas in the center — with **no generator functionality** (every functional slot is a placeholder).

**Architecture:** A single `StudioShell` component reads the `:genId` route param, looks the generator up in `registry`, and renders the sidebar-15 layout: `SidebarLeft` (brand + registry-driven nav), `SidebarInset` (a minor header with breadcrumb + right-sidebar toggle, then the generator's `Preview`), and a toggleable `SidebarRight` hosting the generator's `Controls`. `react-router` (`BrowserRouter` in `main.tsx`) maps `/` → first generator, `/:genId` → `StudioShell`, `*` → first generator. The placeholder generator's `Preview` becomes a dummy Konva `<Stage>` to prove the canvas stack. The right-ops toggle is local component state (the single `SidebarProvider` already owns the left sidebar's collapse).

**Tech Stack:** Vite + React 19 + TypeScript, Tailwind v4 + shadcn/ui (sidebar-15 block), **react-router** (routing), **konva + react-konva** (dummy canvas), vitest + @testing-library/react + jsdom.

**Reference spec:** `docs/superpowers/specs/2026-06-16-collage-studio-design-v2.md` (sections 3.2, 3.3, 10 P1)

---

## Prerequisite

Start on a feature branch off the current HEAD (`130cdac`, which includes P0 + the v2 design). The current branch name (`feat/collage-studio-p1-render-core`) is stale; a name like `feat/collage-studio-p1-shell-routing` fits this work. If executing via subagent-driven-development, it manages the worktree/branch.

## File Structure (this phase)

- **Modify:** `package.json` — add `react-router`, `konva`, `react-konva`.
- **Modify:** `src/test/setup.ts` — add `matchMedia` + `react-konva` test mocks.
- **Rewrite:** `src/components/sidebar-left.tsx` — brand + generator nav from `registry` (NavLink).
- **Rewrite:** `src/components/sidebar-right.tsx` — `Controls` host (children), `collapsible="none"`.
- **Rewrite:** `src/generators/placeholder/PlaceholderGenerator.tsx` — `PlaceholderPreview` becomes a dummy Konva `<Stage>`.
- **Create:** `src/app/StudioShell.tsx` — the sidebar-15 layout, reads `:genId`.
- **Rewrite:** `src/app/App.tsx` — the `<Routes>` table (was the hand-rolled 3-column shell).
- **Modify:** `src/main.tsx` — wrap `<App/>` in `<BrowserRouter>`.
- **Tests:** `src/components/__tests__/sidebar-left.test.tsx`, `sidebar-right.test.tsx`, `src/generators/placeholder/__tests__/PlaceholderGenerator.test.tsx`, `src/app/__tests__/StudioShell.test.tsx`; **rewrite** `src/app/__tests__/App.test.tsx`.

> Note: the imported block's demo nav components (`nav-favorites`, `nav-workspaces`, `nav-secondary`, `nav-user`, `calendars`, `date-picker`, `team-switcher`, `nav-main`) are no longer imported after the rewrites. They are harmless dead files; deleting them is an optional cleanup, not part of acceptance.

---

### Task 1: Install routing + canvas dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

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

// jsdom does not implement matchMedia; the shadcn Sidebar uses it for mobile detection.
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

### Task 3: `SidebarLeft` — registry-driven generator nav (TDD)

**Files:**
- Test: `src/components/__tests__/sidebar-left.test.tsx`
- Rewrite: `src/components/sidebar-left.tsx`

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
Expected: FAIL — the current `SidebarLeft` renders sample data ("Acme Inc"), not registry links / "Collage Studio".

- [ ] **Step 3: Rewrite `src/components/sidebar-left.tsx`**

```tsx
// src/components/sidebar-left.tsx
import * as React from "react";
import { NavLink, useLocation } from "react-router";
import { Layers } from "lucide-react";

import { registry } from "@/app/registry";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export function SidebarLeft({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation();

  return (
    <Sidebar className="border-r-0" {...props}>
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
        <SidebarGroup>
          <SidebarGroupLabel>Generators</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {registry.map((g) => (
                <SidebarMenuItem key={g.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === `/${g.id}`}
                  >
                    <NavLink to={`/${g.id}`}>
                      <span>{g.name}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/sidebar-left.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar-left.tsx src/components/__tests__/sidebar-left.test.tsx
git commit -m "feat(p1): registry-driven generator nav in SidebarLeft"
```

---

### Task 4: `SidebarRight` — Controls host (TDD)

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
Expected: FAIL — the current `SidebarRight` renders sample calendars, not arbitrary children.

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
      className="hidden h-full w-80 shrink-0 border-l border-sidebar-border lg:flex"
      {...props}
    >
      <SidebarContent>{children}</SidebarContent>
    </Sidebar>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/__tests__/sidebar-right.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar-right.tsx src/components/__tests__/sidebar-right.test.tsx
git commit -m "feat(p1): SidebarRight as Controls host"
```

---

### Task 5: Dummy Konva canvas in `PlaceholderPreview` (TDD)

**Files:**
- Test: `src/generators/placeholder/__tests__/PlaceholderGenerator.test.tsx`
- Modify: `src/generators/placeholder/PlaceholderGenerator.tsx`

> Keep the canvas label text as `"Preview area"` (the existing `App.test.tsx` asserts it) so the old shell test stays green until Task 7 rewrites it.

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

### Task 6: `StudioShell` — the sidebar-15 layout (TDD)

**Files:**
- Test: `src/app/__tests__/StudioShell.test.tsx`
- Create: `src/app/StudioShell.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/__tests__/StudioShell.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("toggles the operations panel from the header button", async () => {
    const user = userEvent.setup();
    renderShellAt("/placeholder");
    expect(screen.getByText("Operations")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Toggle operations panel" }),
    );
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/__tests__/StudioShell.test.tsx`
Expected: FAIL — "Cannot find module '../StudioShell'".

- [ ] **Step 3: Implement `src/app/StudioShell.tsx`**

```tsx
// src/app/StudioShell.tsx
import { useState } from "react";
import type { ReactNode } from "react";
import { NavLink, useParams } from "react-router";
import { PanelRight } from "lucide-react";

import { registry } from "@/app/registry";
import { SidebarLeft } from "@/components/sidebar-left";
import { SidebarRight } from "@/components/sidebar-right";
import { Button } from "@/components/ui/button";
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
  const [rightOpen, setRightOpen] = useState(true);

  const Preview = generator.Preview;
  const Controls = generator.Controls;
  const Provider = generator.Provider ?? PassthroughProvider;

  return (
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
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label="Toggle operations panel"
            aria-expanded={rightOpen}
            onClick={() => setRightOpen((open) => !open)}
          >
            <PanelRight />
          </Button>
        </header>

        <Provider>
          <div className="flex flex-1 overflow-hidden">
            <section className="flex flex-1 items-center justify-center overflow-auto p-4">
              <Preview />
            </section>
            {rightOpen && (
              <SidebarRight>
                <Controls />
              </SidebarRight>
            )}
          </div>
        </Provider>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/__tests__/StudioShell.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/StudioShell.tsx src/app/__tests__/StudioShell.test.tsx
git commit -m "feat(p1): add StudioShell sidebar-15 layout reading :genId"
```

---

### Task 7: Routing — `App` route table + `BrowserRouter` + rewrite `App.test` (TDD)

**Files:**
- Rewrite: `src/app/App.tsx` (was the hand-rolled 3-column shell)
- Rewrite: `src/app/__tests__/App.test.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/__tests__/App.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("hides the operations panel on toggle click", async () => {
    const user = userEvent.setup();
    renderAt("/placeholder");
    await user.click(
      screen.getByRole("button", { name: "Toggle operations panel" }),
    );
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/__tests__/App.test.tsx`
Expected: FAIL — the current `App` is the hand-rolled shell (no breadcrumb navigation; no "Toggle operations panel" button).

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

- [ ] **Step 4: Wrap `App` in `BrowserRouter` in `src/main.tsx`**

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/__tests__/App.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx src/app/__tests__/App.test.tsx src/main.tsx
git commit -m "feat(p1): route /:genId to StudioShell via react-router"
```

---

### Task 8: Full suite + typecheck + build + manual smoke

**Files:** none new.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all PASS — `registry` (3), `SidebarLeft` (2), `SidebarRight` (1), `PlaceholderGenerator` (3), `StudioShell` (3), `App` (4).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (bundles konva + react-konva + react-router).

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`, open http://localhost:5173, then confirm:
- `/` redirects to `/placeholder`; the URL bar shows it.
- Layout: left nav (brand "Collage Studio" + "Placeholder" link), center minor header (breadcrumb "Collage Studio / Placeholder" + a right toggle button) over a dashed dummy canvas reading "Preview area", right ops panel reading "Operations".
- Clicking the right-toggle button hides/shows the ops panel.
- The left `SidebarTrigger` (and ⌘B) collapse/expand the left nav.
- Refreshing at `/placeholder` deep-links correctly.

- [ ] **Step 5: Commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "test(p1): p1 shell-routing acceptance fixes"
```

(Skip if Steps 1–3 passed with no changes.)

---

## P1 Acceptance

- App boots in the **sidebar-15 inset layout** (left nav / minor header + center canvas / toggleable right ops).
- **react-router** drives URLs: `/` redirects to the first generator; `/:genId` renders `StudioShell`; deep-linking + back/forward work.
- Left nav links are built from `registry`; breadcrumb reflects the active generator.
- A **dummy Konva `<Stage>`** renders in the center (canvas stack proven).
- Right ops panel toggles from the header.
- `npm test` green; `tsc --noEmit` clean; `npm run build` succeeds.

## Handoff to P2

P2 (separate plan) populates the swap-collage generator: installs nothing new for routing, adds the pure `geometry`/`fit` helpers + tests, `SwapCollageProvider`/`Preview`/`Controls`, the on-canvas mask (Konva `Rect` + `Transformer`), and export via `stage.toCanvas`, and appends the `swap-collage` entry to `registry` (→ `/swap-collage`). The shell, routing, and test mocks from P1 are reused unchanged.
