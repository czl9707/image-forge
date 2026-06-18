import { Layer, Rect, Stage, Text } from "react-konva";

const CANVAS_W = 720;
const CANVAS_H = 540;

export function PlaceholderPreview() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Stage width={CANVAS_W} height={CANVAS_H}>
        <Layer>
          <Rect
            x={0}
            y={0}
            width={CANVAS_W}
            height={CANVAS_H}
            stroke="#94a3b8"
            dash={[8, 6]}
          />
          <Text
            text="Preview area"
            x={0}
            y={CANVAS_H / 2 - 12}
            width={CANVAS_W}
            align="center"
            fontSize={20}
            fill="#94a3b8"
          />
        </Layer>
      </Stage>
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
