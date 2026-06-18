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
