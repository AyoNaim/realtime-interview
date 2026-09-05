interface LatencyMeterProps {
  latencyMs: number | null;
  isMeasuring: boolean;
}

export function LatencyMeter({
  latencyMs,
  isMeasuring,
}: LatencyMeterProps) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.16em]">
      <div className="mb-2 text-[#e9e7e1]/25">
        First token
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-sm tracking-normal text-[#e9e7e1]/75">
          {formatLatency(latencyMs)}
        </span>

        {isMeasuring && (
          <span className="text-[#d66a3d]">
            measuring
          </span>
        )}
      </div>
    </div>
  );
}

function formatLatency(
  latencyMs: number | null,
): string {
  if (latencyMs === null) {
    return "—";
  }

  return `${Math.round(latencyMs)} ms`;
}