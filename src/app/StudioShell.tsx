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
      <SidebarProvider className="min-h-0 h-svh overflow-hidden">
        <SidebarLeft />
        <SidebarInset className="min-w-0">
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
                    <NavLink to={`/${registry[0].id}`}>Image Forge</NavLink>
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

          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto p-4 md:p-8 lg:p-16">
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
