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
