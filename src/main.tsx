import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeColorsProvider } from "@/hooks/useThemeColors";
import { Toaster } from "@/components/ui/sonner";
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
      <ThemeColorsProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeColorsProvider>
      <Toaster />
    </ThemeProvider>
  </StrictMode>,
);
