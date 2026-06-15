# Collage Studio — P0 Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bootable, layout-only React shell with a 3-column layout (left nav / center preview / right ops), a `Generator` registry contract, and one placeholder generator — no image logic.

**Architecture:** Shell owns the 3-column geometry for UX consistency across future generators. Each generator supplies `Preview` + `Controls` (+ optional `Provider` for shared state); the shell places `Preview` in the center and `Controls` in the right column, both wrapped in the generator's `Provider`. Nav is built from a `registry` array.

**Tech Stack:** Vite + React + TypeScript, Tailwind CSS, shadcn/ui, vitest + jsdom + @testing-library/react.

**Reference spec:** `docs/superpowers/specs/2026-06-15-collage-studio-design.md`

---

## File Structure (this phase)

- `src/app/registry.ts` — `Generator` type + `registry` array (placeholder entry). Pure, testable.
- `src/app/App.tsx` — 3-col shell: nav from registry + active `Preview`/`Controls` inside `Provider`.
- `src/generators/placeholder/PlaceholderGenerator.tsx` — dummy `Preview` + `Controls`.
- `src/app/__tests__/registry.test.ts` — registry invariants.
- `src/app/__tests__/App.test.tsx` — shell renders nav + placeholders, switches on click.
- `vitest.config.ts`, `src/test/setup.ts` — test toolchain.

Scaffold baseline (`package.json`, `vite.config.ts`, `tsconfig*.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/index.css`, `src/components/ui/*`) comes from the prerequisite template import (see Prerequisite below).

---

## Prerequisite: baseline scaffold

The repo currently contains only `docs/`, `collage/`, and `.git`. Before Task 1, ensure a Vite + React + TS + Tailwind + shadcn baseline exists at the repo root. The user imports a shadcn template; if not yet done, scaffold manually:

```bash
# from repo root /home/zain_chen/kiyo-n-zane/nolli-collage
npm create vite@latest . -- --template react-ts     # if package.json absent; pick "Ignore files and continue" on non-empty prompt
npm install
npm install -D tailwindcss @tailwindcss/vite          # Tailwind v4 vite plugin
npx shadcn@latest init                                # follow prompts; choose "New York", "CSS variables", src path "src", base color
npx shadcn@latest add button separator                # add components as needed later
```

If `npm create vite` into the non-empty dir is problematic, scaffold in `./_tmp` then move `package.json`, `src/`, `index.html`, configs into the repo root (do not overwrite `docs/`, `collage/`, `.git`).

**Verify baseline:**
```bash
npm run dev     # app boots on http://localhost:5173
npm run build   # builds without error
```

---

### Task 1: Testing toolchain

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json` (devDeps + test script)

- [ ] **Step 1: Install test deps**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

If `@vitejs/plugin-react` is not present, install it: `npm install -D @vitejs/plugin-react`.

- [ ] **Step 3: Create `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test script to `package.json`** (merge into `scripts`)

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify vitest runs (no tests yet → exits cleanly)**

Run: `npx vitest run`
Expected: "No test files found" and exit code 0.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/test/setup.ts package.json package-lock.json
git commit -m "chore(p0): add vitest + testing-library toolchain"
```

---

### Task 2: Placeholder generator components

**Files:**
- Create: `src/generators/placeholder/PlaceholderGenerator.tsx`

- [ ] **Step 1: Create the placeholder `Preview` and `Controls`**

```tsx
// src/generators/placeholder/PlaceholderGenerator.tsx
export function PlaceholderPreview() {
  return (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
      Preview area
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

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/generators/placeholder/PlaceholderGenerator.tsx
git commit -m "feat(p0): add placeholder generator components"
```

---

### Task 3: `Generator` type + registry (TDD)

**Files:**
- Test: `src/app/__tests__/registry.test.ts`
- Create: `src/app/registry.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/__tests__/registry.test.ts
import { describe, expect, it } from "vitest";
import { registry } from "../registry";

describe("registry", () => {
  it("is non-empty", () => {
    expect(registry.length).toBeGreaterThan(0);
  });

  it("has unique ids", () => {
    const ids = registry.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has a name and callable Preview + Controls", () => {
    for (const g of registry) {
      expect(typeof g.name).toBe("string");
      expect(typeof g.Preview).toBe("function");
      expect(typeof g.Controls).toBe("function");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/__tests__/registry.test.ts`
Expected: FAIL — "Cannot find module '../registry'" (or "registry is not defined").

- [ ] **Step 3: Implement the registry**

```ts
// src/app/registry.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/__tests__/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/registry.ts src/app/__tests__/registry.test.ts
git commit -m "feat(p0): add Generator type and registry"
```

---

### Task 4: 3-column App shell (TDD)

**Files:**
- Test: `src/app/__tests__/App.test.tsx`
- Create: `src/app/App.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/__tests__/App.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";

describe("App shell", () => {
  it("renders nav from registry", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Placeholder" })).toBeInTheDocument();
  });

  it("renders the active generator's Preview and Controls", () => {
    render(<App />);
    expect(screen.getByText("Preview area")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("switches active generator on nav click", async () => {
    const user = userEvent.setup();
    render(<App />);
    const btn = screen.getByRole("button", { name: "Placeholder" });
    await user.click(btn);
    // still rendered (single generator); assert no crash + still present
    expect(screen.getByText("Preview area")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/__tests__/App.test.tsx`
Expected: FAIL — "Cannot find module '../App'".

- [ ] **Step 3: Implement the shell**

```tsx
// src/app/App.tsx
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { registry } from "./registry";

export function App() {
  const [activeId, setActiveId] = useState<string>(registry[0]?.id ?? "");
  const active = registry.find((g) => g.id === activeId) ?? null;

  const Preview = active?.Preview ?? Fragment;
  const Controls = active?.Controls ?? Fragment;
  const Provider = active?.Provider ?? (({ children }: { children: ReactNode }) => <>{children}</>);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <nav className="flex w-56 shrink-0 flex-col border-r">
        <div className="px-4 py-3 text-sm font-medium text-muted-foreground">Collage Studio</div>
        <ul className="flex flex-col">
          {registry.map((g) => {
            const isActive = g.id === activeId;
            return (
              <li key={g.id}>
                <button
                  onClick={() => setActiveId(g.id)}
                  className={`w-full px-4 py-2 text-left text-sm ${
                    isActive ? "bg-accent font-medium" : "hover:bg-accent/50"
                  }`}
                >
                  {g.name}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <Provider>
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-hidden p-6">
          <Preview />
        </main>
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l">
          <Controls />
        </aside>
      </Provider>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/__tests__/App.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/App.tsx src/app/__tests__/App.test.tsx
git commit -m "feat(p0): add 3-column App shell reading from registry"
```

---

### Task 5: Wire `App` into entry + verify build

**Files:**
- Modify: `src/main.tsx` (render `<App />`)

- [ ] **Step 1: Ensure `src/main.tsx` renders `App`**

If the Vite template's `main.tsx` still renders the default `<App />` from `./App`, replace its import to use the shell. Final `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests PASS (registry + App).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`
Open http://localhost:5173. Confirm: 3 columns visible (nav left, "Preview area" center, "Operations" right), no global header, clicking nav keeps the layout intact.

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx
git commit -m "feat(p0): wire App shell into entry point"
```

---

## P0 Acceptance

- App boots; 3-column layout renders (nav / preview / ops); no global header.
- Nav lists registry entries; clicking switches the active generator (single placeholder for now).
- `Generator` contract (`{ id, name, Preview, Controls, Provider? }`) defined and used by the shell.
- `npm test` green; `npm run build` succeeds.

## Handoff to P1

P1 builds the pure rendering layer (`fit`, `geometry`, `renderSwap`) — no UI. P2 then replaces the placeholder generator with the real swap-collage generator using that layer.
