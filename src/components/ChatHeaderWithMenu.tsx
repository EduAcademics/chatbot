/**
 * Chat header with 3-dot menu (routing, flow options, device, language).
 * Extracted from AudioStreamerChatBot to reduce main file size.
 */
import { motion } from "framer-motion";
import { FiMoreVertical } from "react-icons/fi";
import type { FlowType } from "./types";

export interface ChatHeaderWithMenuProps {
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

export default function ChatHeaderWithMenu(props: ChatHeaderWithMenuProps) {
  const {
    menuRef, isMenuOpen, setIsMenuOpen, setAutoRouting,
    handleFlowExit, setUserOptionSelected, setChatHistory: _setChatHistory, activeFlow, setActiveFlow: _setActiveFlow,
    attendanceStep: _attendanceStep, setAttendanceStep: _setAttendanceStep, setPendingClassInfo: _setPendingClassInfo, hoveredMenuItem, setHoveredMenuItem,
    hoverTimeoutRef, getErpContext: _getErpContext, sessionId: _sessionId, userId: _userId, activeFlowRef: _activeFlowRef, setIsProcessing: _setIsProcessing,
    setLeaveApprovalRequests: _setLeaveApprovalRequests, setRejectReason: _setRejectReason, setLoadingLeaveRequests: _setLoadingLeaveRequests,
    devices, selectedDeviceId, setSelectedDeviceId, languages, selectedLanguage, setSelectedLanguage,
  } = props;
  return (
    <div className="chatbot-header-section">
      <h1 className="chatbot-header-title">Sofisto</h1>
      <div className="three-dot-menu-container" ref={menuRef}>
        <motion.button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="three-dot-menu-btn"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          title="Menu"
        >
          <FiMoreVertical size={24} />
        </motion.button>

        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="three-dot-menu"
          >
            {/* Select Flow: default and only option; LLM-based intent classification */}
            <div
              className="menu-item-option"
              onClick={() => {
                handleFlowExit({ newSession: false });
                setAutoRouting(true);
                setUserOptionSelected(true);
                setIsMenuOpen(false);
              }}
              style={{
                backgroundColor: activeFlow === "none" ? "#f0f0f0" : "white",
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              <span className="menu-option-label">{activeFlow === "none" ? "✓ " : ""}Select Flow</span>

            </div>

            <div
              className="menu-item-option"
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                  hoverTimeoutRef.current = null;
                }
                setHoveredMenuItem("default");
              }}
              onMouseLeave={() => {
                hoverTimeoutRef.current = setTimeout(() => {
                  setHoveredMenuItem(null);
                }, 100);
              }}
              onClick={() => {
                setSelectedDeviceId("default");
                setIsMenuOpen(false);
              }}
            >
              <span className="menu-option-label">Default</span>
              {hoveredMenuItem === "default" && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="menu-tooltip-right"
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={() => {
                    if (hoverTimeoutRef.current) {
                      clearTimeout(hoverTimeoutRef.current);
                      hoverTimeoutRef.current = null;
                    }
                    setHoveredMenuItem("default");
                  }}
                  onMouseLeave={() => {
                    hoverTimeoutRef.current = setTimeout(() => {
                      setHoveredMenuItem(null);
                    }, 100);
                  }}
                >
                  <div
                    style={{
                      marginBottom: "0.5rem",
                      fontWeight: "600",
                      fontSize: "0.85rem",
                    }}
                  >
                    Device Options:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <div
                      onClick={() => {
                        setSelectedDeviceId("default");
                        setIsMenuOpen(false);
                      }}
                      style={{
                        opacity: selectedDeviceId === "default" ? 1 : 0.7,
                        fontWeight:
                          selectedDeviceId === "default" ? "600" : "400",
                        cursor: "pointer",
                        padding: "0.25rem 0.5rem",
                        borderRadius: "4px",
                        transition: "background 0.2s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255, 255, 255, 0.2)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      Default
                    </div>
                    {devices.map((device) => (
                      <div
                        key={device.deviceId}
                        onClick={() => {
                          setSelectedDeviceId(device.deviceId);
                          setIsMenuOpen(false);
                        }}
                        style={{
                          opacity:
                            selectedDeviceId === device.deviceId
                              ? 1
                              : 0.7,
                          fontWeight:
                            selectedDeviceId === device.deviceId
                              ? "600"
                              : "400",
                          cursor: "pointer",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "rgba(255, 255, 255, 0.2)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            "transparent")
                        }
                      >
                        {device.label ||
                          `Mic (${device.deviceId.slice(-4)})`}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            <div
              className="menu-item-option"
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                  hoverTimeoutRef.current = null;
                }
                setHoveredMenuItem("autodetect");
              }}
              onMouseLeave={() => {
                hoverTimeoutRef.current = setTimeout(() => {
                  setHoveredMenuItem(null);
                }, 100);
              }}
              onClick={() => {
                setSelectedLanguage("auto");
                setIsMenuOpen(false);
              }}
            >
              <span className="menu-option-label">Auto Detect</span>
              {hoveredMenuItem === "autodetect" && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="menu-tooltip-right"
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={() => {
                    if (hoverTimeoutRef.current) {
                      clearTimeout(hoverTimeoutRef.current);
                      hoverTimeoutRef.current = null;
                    }
                    setHoveredMenuItem("autodetect");
                  }}
                  onMouseLeave={() => {
                    hoverTimeoutRef.current = setTimeout(() => {
                      setHoveredMenuItem(null);
                    }, 100);
                  }}
                >
                  <div
                    style={{
                      marginBottom: "0.5rem",
                      fontWeight: "600",
                      fontSize: "0.85rem",
                    }}
                  >
                    Language Options:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    {languages.map((lang) => (
                      <div
                        key={lang.value}
                        onClick={() => {
                          setSelectedLanguage(lang.value);
                          setIsMenuOpen(false);
                        }}
                        style={{
                          opacity:
                            selectedLanguage === lang.value ? 1 : 0.7,
                          fontWeight:
                            selectedLanguage === lang.value
                              ? "600"
                              : "400",
                          cursor: "pointer",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "rgba(255, 255, 255, 0.2)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            "transparent")
                        }
                      >
                        {lang.label}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}