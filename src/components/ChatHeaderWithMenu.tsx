/**
 * Chat header with back button and title.
 */
import { FiChevronLeft } from "react-icons/fi";
import type { FlowType } from "./types";

export interface ChatHeaderWithMenuProps {
  onBack?: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  isMenuOpen: boolean;
  setIsMenuOpen: (v: boolean) => void;
  setAutoRouting: (v: boolean) => void;
  handleFlowExit: (opts?: { newSession?: boolean }) => void;
  setUserOptionSelected: (v: boolean) => void;
  setChatHistory: React.Dispatch<React.SetStateAction<any[]>>;
  activeFlow: FlowType;
  setActiveFlow: (v: FlowType) => void;
  attendanceStep: "class_info" | "student_details" | "completed";
  setAttendanceStep: (v: "class_info" | "student_details" | "completed") => void;
  setPendingClassInfo: (v: any) => void;
  hoveredMenuItem: string | null;
  setHoveredMenuItem: (v: string | null) => void;
  hoverTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  getErpContext: () => { academic_session: string; branch_token: string };
  sessionId: string;
  userId: string;
  activeFlowRef: React.MutableRefObject<FlowType>;
  setIsProcessing: (v: boolean) => void;
  setLeaveApprovalRequests: (v: any[]) => void;
  setRejectReason: (v: { [k: string]: string }) => void;
  setLoadingLeaveRequests: (v: boolean) => void;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  setSelectedDeviceId: (v: string) => void;
  languages: { label: string; value: string }[];
  selectedLanguage: string;
  setSelectedLanguage: (v: string) => void;
}

export default function ChatHeaderWithMenu({ onBack }: ChatHeaderWithMenuProps) {
  return (
    <div className="chatbot-header-section">
      {onBack ? (
        <button
          type="button"
          className="chatbot-glass-btn chatbot-header-back-btn"
          onClick={onBack}
          aria-label="Go back"
        >
          <FiChevronLeft size={22} />
        </button>
      ) : (
        <span className="chatbot-glass-btn-placeholder" />
      )}
      <h1 className="chatbot-header-title">Chat with AI</h1>
      <span
        className="chatbot-glass-btn-placeholder"
        style={{ gridColumn: 3, justifySelf: "end" }}
      />
    </div>
  );
}
