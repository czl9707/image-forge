import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { registry } from "./registry";

function PassthroughProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function App() {
  const [activeId, setActiveId] = useState<string>(registry[0]?.id ?? "");
  const active = registry.find((g) => g.id === activeId) ?? null;

  const Preview = active?.Preview ?? Fragment;
  const Controls = active?.Controls ?? Fragment;
  const Provider = active?.Provider ?? PassthroughProvider;

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
                  aria-current={isActive ? "page" : undefined}
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
