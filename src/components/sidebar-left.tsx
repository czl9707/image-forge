import * as React from "react";
import { useLocation } from "react-router";
import { createLucideIcon, Layers } from "lucide-react";

/**
 * Lucide dropped brand icons, so we recreate the GitHub mark via the
 * `createLucideIcon` helper using lucide's original icon-node paths.
 */
const Github = createLucideIcon("Github", [
  [
    "path",
    {
      d: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4",
    },
  ],
  ["path", { d: "M9 18c-4.51 2-5-2-7-2" }],
]);

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
  { title: "Github", url: "https://github.com/czl9707/image-forge", icon: Github },
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
    <Sidebar variant="inset" collapsible="offcanvas" className="border-r-0" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Layers className="size-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Image Forge</span>
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
