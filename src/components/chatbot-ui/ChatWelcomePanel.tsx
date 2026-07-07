import { motion } from "framer-motion";
import { FiMessageCircle } from "react-icons/fi";
import AiMascot from "./AiMascot";
import { getSuggestedPrompts } from "../../utils/resolvePersona";

interface ChatWelcomePanelProps {
  roles: string;
  onSelectPrompt: (prompt: string) => void;
}

export default function ChatWelcomePanel({
  roles,
  onSelectPrompt,
}: ChatWelcomePanelProps) {
  const suggestedPrompts = getSuggestedPrompts(roles).slice(0, 4);
  return (
    <motion.div
      className="chat-welcome-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <AiMascot size={120} animate={false} />
      <h2 className="chat-welcome-title">How can I help you today?</h2>
      <p className="chat-welcome-subtitle">
        Type a message or tap a suggestion below to get started.
      </p>

      <div className="chat-welcome-tips">
        <span className="chat-welcome-tip">
          <FiMessageCircle size={14} aria-hidden />
          Tap a suggestion to start
        </span>
      </div>

      <div className="chat-welcome-prompts">
        {suggestedPrompts.map((prompt, i) => (
          <motion.button
            key={prompt}
            type="button"
            className="chat-welcome-prompt-btn"
            onClick={() => onSelectPrompt(prompt)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * i, duration: 0.3 }}
            whileTap={{ scale: 0.97 }}
          >
            {prompt}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
