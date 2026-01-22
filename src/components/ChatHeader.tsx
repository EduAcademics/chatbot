import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FiMoreVertical } from "react-icons/fi";
import type { FlowType } from "./types";

export type SofistoBotType = "default" | "interview";
export type RouterMode = "manual" | "auto" | "llm";

export interface ChatHeaderProps {
  selectedBot: SofistoBotType;
  onSelectedBotChange: (bot: SofistoBotType) => void;

  routerMode: RouterMode;
  activeFlow: FlowType;

  onSetRoutingMode: (mode: RouterMode) => void | Promise<void>;
  onSelectFlow: (flow: FlowType) => void | Promise<void>;

  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onSelectDeviceId: (deviceId: string) => void;

  languages: { label: string; value: string }[];
  selectedLanguage: string;
  onSelectLanguage: (value: string) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  selectedBot,
  onSelectedBotChange,
  routerMode,
  activeFlow,
  onSetRoutingMode,
  onSelectFlow,
  devices,
  selectedDeviceId,
  onSelectDeviceId,
  languages,
  selectedLanguage,
  onSelectLanguage,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
        setHoveredMenuItem(null);
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    };
  }, [isMenuOpen]);

  return (
    <div className="chatbot-header-section">
      <h1 className="chatbot-header-title">
        <img src="/sofisto-img.png" alt="Sofisto Robot" className="robot-icon" />
        Chat with Sofisto
      </h1>

      <div className="bot-selector-container">
        <select
          value={selectedBot}
          onChange={(e) => onSelectedBotChange(e.target.value as SofistoBotType)}
          className="bot-selector"
        >
          <option value="default">Default Bot</option>
          <option value="interview">Interview Bot</option>
        </select>
      </div>

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
            {/* Routing Mode Selection */}
            <div style={{ padding: "8px 0" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "bold",
                  padding: "8px 12px",
                  color: "#666",
                }}
              >
                Routing Mode:
              </div>

              <div
                className="menu-item-option"
                onClick={async () => {
                  await onSetRoutingMode("manual");
                  setIsMenuOpen(false);
                }}
                style={{
                  backgroundColor: routerMode === "manual" ? "#f0f0f0" : "white",
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Manual
              </div>

              <div
                className="menu-item-option"
                onClick={async () => {
                  await onSetRoutingMode("auto");
                  setIsMenuOpen(false);
                }}
                style={{
                  backgroundColor: routerMode === "auto" ? "#f0f0f0" : "white",
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Auto Route
              </div>

              <div
                className="menu-item-option"
                onClick={async () => {
                  await onSetRoutingMode("llm");
                  setIsMenuOpen(false);
                }}
                style={{
                  backgroundColor: routerMode === "llm" ? "#f0f0f0" : "white",
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontSize: "12px",
                  borderBottom: "1px solid #ddd",
                }}
              >
                LLM Route
              </div>
            </div>

            {/* Divider */}
            <div
              style={{
                borderTop: "1px solid #ddd",
                margin: "5px 0",
              }}
            />

            {/* Flow selection */}
            <div
              className="menu-item-option"
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                  hoverTimeoutRef.current = null;
                }
                setHoveredMenuItem("query");
              }}
              onMouseLeave={() => {
                hoverTimeoutRef.current = setTimeout(() => {
                  setHoveredMenuItem(null);
                }, 100);
              }}
              onClick={async () => {
                await onSelectFlow("query");
                setIsMenuOpen(false);
              }}
            >
              <span className="menu-option-label">📊 Query</span>
              {hoveredMenuItem === "query" && (
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
                    setHoveredMenuItem("query");
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
                    Flow Options:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    {(
                      [
                        { flow: "query", label: "Query" },
                        {
                          flow: "attendance",
                          label: "Mark Attendance (Text/Image)",
                        },
                        { flow: "voice_attendance", label: "Mark Attendance (Voice)" },
                        { flow: "leave", label: "Apply for Leave" },
                        { flow: "leave_approval", label: "Leave Approval Flow" },
                        { flow: "assignment", label: "Assignment Flow" },
                        { flow: "course_progress", label: "Course Progress" },
                        { flow: "none", label: "Select Flow" },
                      ] as { flow: FlowType; label: string }[]
                    ).map((item) => (
                      <div
                        key={item.flow}
                        onClick={async () => {
                          await onSelectFlow(item.flow);
                          setIsMenuOpen(false);
                        }}
                        style={{
                          opacity: activeFlow === item.flow ? 1 : 0.7,
                          fontWeight: activeFlow === item.flow ? "600" : "400",
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
                        {activeFlow === item.flow ? "✓ " : ""}
                        {item.label}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Device selection */}
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
                onSelectDeviceId("default");
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
                        onSelectDeviceId("default");
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
                      {selectedDeviceId === "default" ? "✓ " : ""}Default
                    </div>
                    {devices.map((device) => (
                      <div
                        key={device.deviceId}
                        onClick={() => {
                          onSelectDeviceId(device.deviceId);
                          setIsMenuOpen(false);
                        }}
                        style={{
                          opacity:
                            selectedDeviceId === device.deviceId ? 1 : 0.7,
                          fontWeight:
                            selectedDeviceId === device.deviceId ? "600" : "400",
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
                        {selectedDeviceId === device.deviceId ? "✓ " : ""}
                        {device.label || `Mic (${device.deviceId.slice(-4)})`}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Language selection */}
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
                onSelectLanguage("auto");
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
                          onSelectLanguage(lang.value);
                          setIsMenuOpen(false);
                        }}
                        style={{
                          opacity: selectedLanguage === lang.value ? 1 : 0.7,
                          fontWeight:
                            selectedLanguage === lang.value ? "600" : "400",
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
                        {selectedLanguage === lang.value ? "✓ " : ""}
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
};

export default ChatHeader;
