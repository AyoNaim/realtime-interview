export type PipelineStage =
  | "idle"
  | "active"
  | "complete";

interface PipelineVisualizerProps {
  capture: PipelineStage;
  stt: PipelineStage;
  inference: PipelineStage;
  response: PipelineStage;
}

interface Stage {
  label: string;
  state: PipelineStage;
}

export function PipelineVisualizer({
  capture,
  stt,
  inference,
  response,
}: PipelineVisualizerProps) {
  const stages: Stage[] = [
    {
      label: "Capture",
      state: capture,
    },
    {
      label: "STT",
      state: stt,
    },
    {
      label: "Inference",
      state: inference,
    },
    {
      label: "Response",
      state: response,
    },
  ];

  return (
    <div
      aria-label="Realtime pipeline"
      className="flex w-full items-center"
    >
      {stages.map((stage, index) => (
        <div
          key={stage.label}
          className="flex flex-1 items-center"
        >
          <PipelineStageItem
            label={stage.label}
            state={stage.state}
          />

          {index < stages.length - 1 && (
            <div
              aria-hidden="true"
              className={`mx-4 h-px flex-1 ${
                stage.state === "complete"
                  ? "bg-[#e9e7e1]/35"
                  : "bg-[#e9e7e1]/10"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

interface PipelineStageItemProps {
  label: string;
  state: PipelineStage;
}

function PipelineStageItem({
  label,
  state,
}: PipelineStageItemProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          state === "active"
            ? "bg-[#d66a3d]"
            : state === "complete"
              ? "bg-[#e9e7e1]/60"
              : "bg-[#e9e7e1]/20"
        }`}
      />

      <span
        className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
          state === "active"
            ? "text-[#e9e7e1]/80"
            : state === "complete"
              ? "text-[#e9e7e1]/55"
              : "text-[#e9e7e1]/25"
        }`}
      >
        {label}
      </span>
    </div>
  );
}