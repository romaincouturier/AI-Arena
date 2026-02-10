"use client";

import type { Message } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  if (message.isSynthesis) {
    return (
      <div className="animate-fade-in-up mx-4 my-4 rounded-xl border border-accent/30 bg-accent/5 p-5">
        <div className="mb-2 flex items-center gap-2">
          <svg
            className="h-5 w-5 text-accent"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="font-semibold text-accent">Synthese finale</span>
        </div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.isUser) {
    return (
      <div className="animate-fade-in-up mx-4 my-3 flex justify-end">
        <div className="max-w-[75%] rounded-xl rounded-br-sm bg-accent/20 px-4 py-3">
          <div className="mb-1 text-xs font-medium text-accent">
            Vous (intervention)
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up mx-4 my-3">
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: message.agentColor }}
        >
          {message.agentName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: message.agentColor }}>
              {message.agentName}
            </span>
            <span className="text-xs text-muted">Tour {message.turnNumber}</span>
            {message.tokenCount && (
              <span className="text-xs text-muted">
                {message.tokenCount} tokens
              </span>
            )}
          </div>
          <div
            className="rounded-xl rounded-tl-sm border px-4 py-3"
            style={{ borderColor: message.agentColor + "40" }}
          >
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {message.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
