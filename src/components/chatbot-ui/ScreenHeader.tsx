import { FiChevronLeft } from "react-icons/fi";

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}

export default function ScreenHeader({ title, onBack, rightSlot }: ScreenHeaderProps) {
  return (
    <div className="chatbot-screen-header">
      {onBack ? (
        <button
          type="button"
          className="chatbot-glass-btn"
          onClick={onBack}
          aria-label="Go back"
          style={{ gridColumn: 1, justifySelf: "start" }}
        >
          <FiChevronLeft size={22} />
        </button>
      ) : (
        <span className="chatbot-glass-btn-placeholder" style={{ gridColumn: 1 }} />
      )}
      <h1 className="chatbot-screen-title">{title}</h1>
      {rightSlot ? (
        <div style={{ gridColumn: 3, justifySelf: "end" }}>{rightSlot}</div>
      ) : (
        <span className="chatbot-glass-btn-placeholder" style={{ gridColumn: 3 }} />
      )}
    </div>
  );
}
