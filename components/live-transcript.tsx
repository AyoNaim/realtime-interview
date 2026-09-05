import type { TranscriptSegment } from "@/types/transcript";

interface LiveTranscriptProps {
  segments: TranscriptSegment[];
  interim: TranscriptSegment | null;
}

export function LiveTranscript({
  segments,
  interim,
}: LiveTranscriptProps) {
  const finalizedText = segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ");

  const interimText = interim?.text.trim() ?? "";

  const hasTranscript =
    finalizedText.length > 0 || interimText.length > 0;

  return (
    <section aria-label="Live transcript">
      <div className="mb-8 font-mono text-[10px] uppercase tracking-[0.22em] text-[#e9e7e1]/35">
        Interviewer
      </div>

      {!hasTranscript ? (
        <p className="max-w-4xl text-4xl font-normal leading-[1.08] tracking-[-0.035em] text-[#e9e7e1]/20 md:text-6xl lg:text-7xl">
          Waiting for speech...
        </p>
      ) : (
        <p className="max-w-4xl text-4xl font-normal leading-[1.08] tracking-[-0.035em] md:text-6xl lg:text-7xl">
          {finalizedText}

          {interimText && (
            <span className="text-[#e9e7e1]/35">
              {" "}
              {interimText}
            </span>
          )}
        </p>
      )}
    </section>
  );
}