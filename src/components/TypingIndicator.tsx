"use client";

interface TypingIndicatorProps {
  agentName: string;
  agentColor: string;
}

export default function TypingIndicator({
  agentName,
  agentColor,
}: TypingIndicatorProps) {
  return (
    <div className="animate-slide-in mx-1.5 sm:mx-4 my-3">
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: agentColor }}
        >
          {agentName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold" style={{ color: agentColor }}>
            {agentName}
          </div>
          <div
            className="inline-flex items-center gap-1 rounded-xl rounded-tl-sm border px-4 py-3"
            style={{ borderColor: agentColor + "40" }}
          >
            <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
            <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
            <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
