import React from "react";

interface ConversationMessage {
  role: "user" | "bot" | "placeholder";
  text: string;
}

interface ChatConversationProps {
  messages: ConversationMessage[];
  isLoading?: boolean;
  autoScroll?: boolean;
}

export const ChatConversation: React.FC<ChatConversationProps> = ({
  messages,
  isLoading = false,
  autoScroll = true,
}) => {
  const chatBoxRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (autoScroll && chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  return (
    <div className="chatbot-chatbox">
      <div
        className="chatbot-messages"
        ref={chatBoxRef}
      >
        {messages.length === 0 && (
          <div className="chatbot-msg-row bot">
            Welcome! I'm ready to help you with queries. You can ask me anything or use the dropdown to select a specific flow.
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`chatbot-msg-row ${msg.role === "user" ? "user" : "bot"}`}
          >
            {msg.role === "user" ? (
              <span className="chatbot-msg-bubble user">
                {msg.text}
              </span>
            ) : (
              <div className="chatbot-msg-bubble bot">
                {msg.text}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="chatbot-msg-row bot">
            <div className="chatbot-msg-bubble bot">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatConversation;
