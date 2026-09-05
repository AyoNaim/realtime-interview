interface ResponseStreamProps {
  response: string;
  isStreaming: boolean;
}

export function ResponseStream({
  response,
  isStreaming,
}: ResponseStreamProps) {
  const hasResponse = response.trim().length > 0;

  return (
    <section aria-label="Suggested response">
      <div className="mb-8 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#e9e7e1]/35">
          Suggested response
        </span>

        {isStreaming && (
          <span
            aria-label="Response streaming"
            className="h-1.5 w-1.5 rounded-full bg-[#d66a3d]"
          />
        )}
      </div>

      {!hasResponse ? (
        <p className="max-w-4xl text-xl leading-[1.45] tracking-[-0.015em] text-[#e9e7e1]/20 md:text-2xl">
          Waiting for a question...
        </p>
      ) : (
        <p
          aria-live="polite"
          className="max-w-4xl text-xl leading-[1.45] tracking-[-0.015em] text-[#e9e7e1]/75 md:text-2xl"
        >
          {response}
          {isStreaming && (
            <span
              aria-hidden="true"
              className="ml-1 inline-block h-5 w-px translate-y-1 bg-[#d66a3d]/70 md:h-6"
            />
          )}
        </p>
      )}
    </section>
  );
}