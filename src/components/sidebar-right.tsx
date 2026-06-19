import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";

export function SidebarRight({
  children,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 h-svh flex w-72"
      {...props}
    >
      <SidebarContent>{children}</SidebarContent>
    </Sidebar>
  );
}
