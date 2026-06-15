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
