import type { ChatMessageView } from "@/features/chat/queries";

export function ChatThread({ messages }: { messages: ChatMessageView[] }) {
  return (
    <div className="space-y-4">
      {messages.map((message, index) => (
        <div
          key={index}
          className={message.author === "PLAYER" ? "border border-border bg-card p-4" : ""}
        >
          <p className="text-body text-foreground">{message.text}</p>
        </div>
      ))}
    </div>
  );
}
