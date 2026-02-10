import Anthropic from "@anthropic-ai/sdk";

export const runtime = "edge";
export const maxDuration = 60;

interface RequestBody {
  apiKey: string;
  model: string;
  systemPrompt: string;
  turnInstruction: string;
  history: { agentName: string; content: string; isUser?: boolean }[];
  topic: string;
  maxTokens: number;
}

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { apiKey, model, systemPrompt, turnInstruction, history, topic, maxTokens } = body;

  if (!apiKey || !model || !systemPrompt) {
    return new Response("Missing required fields", { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  // Build messages from history
  const messages: Anthropic.MessageParam[] = [];

  if (history && history.length > 0) {
    // Build a conversation summary as a user message
    const historyText = history
      .map((m) => `[${m.isUser ? "Utilisateur" : m.agentName}]: ${m.content}`)
      .join("\n\n");

    messages.push({
      role: "user",
      content: `Voici l'historique de la discussion jusqu'ici :\n\n${historyText}\n\n---\n\nInstruction pour ce tour : ${turnInstruction}`,
    });
  } else {
    messages.push({
      role: "user",
      content: `Sujet de discussion : ${topic}\n\nInstruction : ${turnInstruction}`,
    });
  }

  try {
    const stream = await client.messages.stream({
      model,
      max_tokens: maxTokens || 500,
      system: systemPrompt,
      messages,
    });

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta") {
              const delta = event.delta;
              if ("text" in delta) {
                const data = JSON.stringify({ type: "content", text: delta.text });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }
            }
          }

          // Get final message for usage stats
          const finalMessage = await stream.finalMessage();
          const usageData = JSON.stringify({
            type: "usage",
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
          });
          controller.enqueue(encoder.encode(`data: ${usageData}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          const errorData = JSON.stringify({ type: "error", message: errorMsg });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(message, { status: 500 });
  }
}
