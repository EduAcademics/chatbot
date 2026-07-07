import { motion } from "framer-motion";
import { FiMic, FiMessageCircle } from "react-icons/fi";
import AiMascot from "./AiMascot";
import { QUICK_ACTIONS } from "../chatbotData";
import type { ChatbotScreen } from "../chatbotData";
import { getSuggestedPrompts } from "../../utils/resolvePersona";
import { formatDisplayName } from "./formatDisplayName";

interface HomeViewProps {
  userName?: string | null;
  roles: string;
  onNavigate: (screen: ChatbotScreen) => void;
  onSelectPrompt: (prompt: string) => void;
}

const actionIcon = (icon: "mic" | "chat") =>
  icon === "mic" ? <FiMic size={22} /> : <FiMessageCircle size={22} />;

export default function HomeView({
  userName,
  roles,
  onNavigate,
  onSelectPrompt,
}: HomeViewProps) {
  const displayName = formatDisplayName(userName);
  const suggestedPrompts = getSuggestedPrompts(roles);

  return (
    <div className="chatbot-screen home-view">
      <motion.div
        className="home-header"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="home-greeting">
          {displayName ? `Hi ${displayName},` : "Hi, I'm SchoolOS AI"}
        </h1>
        <p className="home-subtitle">
          Ask any questions you have — your SchoolOS AI buddy is always ready to
          help.
        </p>
      </motion.div>

      <div className="home-mascot-wrap">
        <AiMascot size={190} />
      </div>

      <p className="home-section-label">Try asking</p>
      <div className="suggested-prompts-scroll">
        {suggestedPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="suggested-prompt-chip"
            onClick={() => onSelectPrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="home-bottom-stack" style={{ marginBottom: "20px" }}>
        <div className="quick-action-grid">
          {QUICK_ACTIONS.map((action, index) => (
            <motion.button
              key={action.id}
              type="button"
              className="quick-action-card"
              onClick={() => onNavigate(action.screen)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * index, duration: 0.3 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <span className="quick-action-icon">{actionIcon(action.icon)}</span>
              <span className="quick-action-label">{action.label}</span>
              <span className="quick-action-desc">{action.description}</span>
            </motion.button>
          ))}
        </div>


      </div>
    </div>
  );
}
