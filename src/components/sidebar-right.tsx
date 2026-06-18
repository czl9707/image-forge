import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";

export function SidebarRight({
  children,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 hidden h-svh lg:flex"
      {...props}
    >
      <SidebarContent>{children}</SidebarContent>
    </Sidebar>
  );
}
