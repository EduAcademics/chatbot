/**
 * Chat header with 3-dot menu (routing, flow options, device, language).
 * Extracted from AudioStreamerChatBot to reduce main file size.
 */
import { motion } from "framer-motion";
import { FiMoreVertical } from "react-icons/fi";
import type { FlowType } from "./types";
import { aiAPI, leaveApprovalAPI } from "../services/api";

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
    handleFlowExit, setUserOptionSelected, setChatHistory, activeFlow, setActiveFlow,
    attendanceStep: _attendanceStep, setAttendanceStep, setPendingClassInfo, hoveredMenuItem, setHoveredMenuItem,
    hoverTimeoutRef, getErpContext, sessionId, userId, activeFlowRef, setIsProcessing,
    setLeaveApprovalRequests, setRejectReason, setLoadingLeaveRequests,
    devices, selectedDeviceId, setSelectedDeviceId, languages, selectedLanguage, setSelectedLanguage,
  } = props;
  return (
    <div className="chatbot-header-section">
      <h1 className="chatbot-header-title">
        <img
          src="/sofisto-img.png"
          alt="Sofisto Robot"
          className="robot-icon"
        />
        Chat with Sofisto
      </h1>
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
              onClick={() => {
                setAutoRouting(false); // Disable auto-routing
                setActiveFlow("query");
                setUserOptionSelected(true);
                setIsMenuOpen(false);
                setChatHistory((prev) => [
                  ...prev,
                  {
                    type: "bot",
                    text: "Query flow activated (Manual override). You can now ask me anything!",
                  },
                ]);
              }}
            >
              <span className="menu-option-label">ðŸ“Š Query</span>
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
                    <div
                      onClick={() => {
                        setAutoRouting(false); // Disable auto-routing
                        setActiveFlow("query");
                        setUserOptionSelected(true);
                        setIsMenuOpen(false);
                        setChatHistory((prev) => [
                          ...prev,
                          {
                            type: "bot",
                            text: "Query flow activated (Manual override). You can now ask me anything!",
                          },
                        ]);
                      }}
                      style={{
                        opacity: activeFlow === "query" ? 1 : 0.7,
                        fontWeight:
                          activeFlow === "query" ? "600" : "400",
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
                      {activeFlow === "query" ? "âœ“ " : ""}Query
                    </div>
                    <div
                      onClick={() => {
                        setAutoRouting(false); // Disable auto-routing
                        setActiveFlow("attendance");
                        setUserOptionSelected(true);
                        setAttendanceStep("class_info");
                        setPendingClassInfo(null);
                        setIsMenuOpen(false);
                        setChatHistory((prev) => [
                          ...prev,
                          {
                            type: "bot",
                            text: "Attendance flow activated (Manual override). First, please provide class information (class name, section, and date). For example: 'Class 6 A on 2025-01-15' or upload an image with class details.",
                          },
                        ]);
                      }}
                      style={{
                        opacity: activeFlow === "attendance" ? 1 : 0.7,
                        fontWeight:
                          activeFlow === "attendance" ? "600" : "400",
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
                      {activeFlow === "attendance" ? "âœ“ " : ""}Mark
                      Attendance (Text/Image)
                    </div>
                    <div
                      onClick={() => {
                        setAutoRouting(false); // Disable auto-routing
                        setActiveFlow("voice_attendance");
                        setUserOptionSelected(true);
                        setAttendanceStep("class_info");
                        setPendingClassInfo(null);
                        setIsMenuOpen(false);
                        setChatHistory((prev) => [
                          ...prev,
                          {
                            type: "bot",
                            text: "Voice attendance flow activated (Manual override)! ðŸŽ¤ You can now use voice commands to mark attendance. First, speak the class information (class name, section, and date), then speak the student names and their attendance status. For example: 'Class 6 A on 2025-01-15' then 'Aarav present, Diya absent'.",
                          },
                        ]);
                      }}
                      style={{
                        opacity:
                          activeFlow === "voice_attendance" ? 1 : 0.7,
                        fontWeight:
                          activeFlow === "voice_attendance"
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
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      {activeFlow === "voice_attendance" ? "âœ“ " : ""}Mark
                      Attendance (Voice)
                    </div>
                    <div
                      onClick={async () => {
                        setAutoRouting(false);
                        activeFlowRef.current = "leave";
                        setActiveFlow("leave");
                        setUserOptionSelected(true);
                        setIsMenuOpen(false);
                        // Start interactive 6-step leave flow: show user message and fetch Step 1 from backend
                        const initialMessage = "apply leave";
                        setChatHistory((prev) => [
                          ...prev,
                          { type: "user", text: initialMessage },
                        ]);
                        setIsProcessing(true);
                        try {
                          const authToken = localStorage.getItem("token");
                          const { academic_session, branch_token } =
                            getErpContext();
                          const data = await aiAPI.leaveChat({
                            session_id: sessionId || userId,
                            user_id: userId,
                            query: initialMessage,
                            bearer_token: authToken || undefined,
                            academic_session,
                            branch_token,
                          });
                          if (data.status === "success" && data.data) {
                            const answer = data.data.answer || "";
                            setChatHistory((prev) => [
                              ...prev,
                              {
                                type: "bot",
                                answer,
                                activeTab: "answer" as const,
                              },
                            ]);
                          } else {
                            setChatHistory((prev) => [
                              ...prev,
                              {
                                type: "bot",
                                text:
                                  data.message ||
                                  "Could not start leave flow. Please try again.",
                              },
                            ]);
                          }
                        } catch (err) {
                          setChatHistory((prev) => [
                            ...prev,
                            {
                              type: "bot",
                              text: "Sorry, there was an error starting the leave flow. Please try again.",
                            },
                          ]);
                        } finally {
                          setIsProcessing(false);
                        }
                      }}
                      style={{
                        opacity: activeFlow === "leave" ? 1 : 0.7,
                        fontWeight:
                          activeFlow === "leave" ? "600" : "400",
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
                      {activeFlow === "leave" ? "âœ“ " : ""}Apply for Leave
                    </div>
                    <div
                      onClick={async () => {
                        activeFlowRef.current = "leave_approval";
                        setActiveFlow("leave_approval");
                        setUserOptionSelected(true);
                        setIsMenuOpen(false);
                        // Clear existing requests and fetch fresh ones
                        setLeaveApprovalRequests([]);
                        setRejectReason({});
                        setLoadingLeaveRequests(true);
                        try {
                          const authToken = localStorage.getItem("token");
                          const { academic_session, branch_token } =
                            getErpContext();
                          const response =
                            await leaveApprovalAPI.fetchPendingRequests({
                              user_id: userId,
                              page: 1,
                              limit: 50,
                              bearer_token: authToken || undefined,
                              academic_session,
                              branch_token,
                            });
                          if (response.status === 200 && response.data) {
                            const pendingRequests =
                              response.data.leaveRequests || [];
                            setLeaveApprovalRequests(pendingRequests);

                            if (pendingRequests.length > 0) {
                              setChatHistory((prev) => [
                                ...prev,
                                {
                                  type: "bot",
                                  answer: `📋 **Leave Approval Dashboard**\n\nFound **${pendingRequests.length}** pending leave request(s) for your approval.\n\nPlease review each request below and take action by either:\n- ✅ **Approve** - Click the green "Approve" button\n- ❌ **Reject** - Enter a rejection reason and click the red "Reject" button`,
                                  activeTab: "answer" as const,
                                },
                              ]);
                            } else {
                              setChatHistory((prev) => [
                                ...prev,
                                {
                                  type: "bot",
                                  answer: `✅ **No Pending Requests**\n\nThere are currently no pending leave requests requiring your approval.\n\nAll leave requests have been processed or there are no new requests at this time.`,
                                  activeTab: "answer" as const,
                                },
                              ]);
                            }
                          } else {
                            setChatHistory((prev) => [
                              ...prev,
                              {
                                type: "bot",
                                text: `⚠️ ${
                                  response.message ||
                                  "No pending leave requests found."
                                }`,
                              },
                            ]);
                          }
                        } catch (err: any) {
                          console.error(
                            "Error fetching leave approval requests:",
                            err,
                          );
                          const errorMessage =
                            err.message ||
                            err.response?.data?.message ||
                            "Unknown error occurred";
                          setChatHistory((prev) => [
                            ...prev,
                            {
                              type: "bot",
                              text: `❌ **Error Loading Leave Requests**\n\nSorry, there was an error fetching leave approval requests.\n\n**Error:** ${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
                            },
                          ]);
                        } finally {
                          setLoadingLeaveRequests(false);
                        }
                      }}
                      style={{
                        opacity:
                          activeFlow === "leave_approval" ? 1 : 0.7,
                        fontWeight:
                          activeFlow === "leave_approval" ? "600" : "400",
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
                      {activeFlow === "leave_approval" ? "âœ“ " : ""}Leave
                      Approval Flow
                    </div>
                    <div
                      onClick={() => {
                        setAutoRouting(false);
                        activeFlowRef.current = "assignment";
                        setActiveFlow("assignment");
                        setUserOptionSelected(true);
                        setIsMenuOpen(false);
                        setChatHistory((prev) => [
                          ...prev,
                          {
                            type: "bot",
                            text: "ðŸ“š **Assignment Creation Flow Activated!** I'll guide you through creating an assignment step by step. Just answer my questions naturally!",
                          },
                        ]);
                      }}
                      style={{
                        opacity: activeFlow === "assignment" ? 1 : 0.7,
                        fontWeight:
                          activeFlow === "assignment" ? "600" : "400",
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
                      {activeFlow === "assignment" ? "âœ“ " : ""}Assignment
                      Flow
                    </div>
                    <div
                      onClick={async () => {
                        // Course progress is now backend-driven
                        // Simply activate the flow and send initial message
                        setAutoRouting(false);
                        activeFlowRef.current = "course_progress";
                        setActiveFlow("course_progress");
                        setUserOptionSelected(true);
                        setIsMenuOpen(false);

                        // Send initial message to backend to start the flow
                        setIsProcessing(true);
                        try {
                          const authToken = localStorage.getItem("token");
                          const { academic_session, branch_token } =
                            getErpContext();

                          const response = await aiAPI.courseProgressChat(
                            {
                              session_id:
                                sessionId || `session_${userId}`,
                              query: "Show my course progress",
                              bearer_token: authToken || undefined,
                              academic_session,
                              branch_token,
                            },
                          );

                          if (
                            response.status === "success" &&
                            response.data
                          ) {
                            const answer =
                              response.data.answer ||
                              "Course Progress flow activated. Which class and section would you like to see?";
                            const botMessage: any = {
                              type: "bot",
                              text: answer,
                            };

                            // Include class sections for nice UI rendering
                            if (
                              response.data.class_sections &&
                              response.data.class_sections.length > 0
                            ) {
                              botMessage.classSectionsOptions =
                                response.data.class_sections;
                            }

                            setChatHistory((prev) => [
                              ...prev,
                              botMessage,
                            ]);
                          } else {
                            setChatHistory((prev) => [
                              ...prev,
                              {
                                type: "bot",
                                text:
                                  response.message ||
                                  "Course Progress flow activated. Please say the class and section you want to view.",
                              },
                            ]);
                          }
                        } catch (err: any) {
                          console.error(
                            "Error activating course progress flow:",
                            err,
                          );
                          setChatHistory((prev) => [
                            ...prev,
                            {
                              type: "bot",
                              text: `❌ Error: ${err.message || "Unknown error"}`,
                            },
                          ]);
                        } finally {
                          setIsProcessing(false);
                        }
                      }}
                      style={{
                        opacity:
                          activeFlow === "course_progress" ? 1 : 0.7,
                        fontWeight:
                          activeFlow === "course_progress"
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
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      {activeFlow === "course_progress" ? "âœ“ " : ""}Course
                      Progress
                    </div>
                    <div
                      onClick={() => {
                        handleFlowExit({ newSession: false });
                        setUserOptionSelected(true);
                        setIsMenuOpen(false);
                      }}
                      style={{
                        opacity: activeFlow === "none" ? 1 : 0.7,
                        fontWeight: activeFlow === "none" ? "600" : "400",
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
                      {activeFlow === "none" ? "âœ“ " : ""}Select Flow
                    </div>
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
                      {selectedDeviceId === "default" ? "âœ“ " : ""}Default
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
                        {selectedDeviceId === device.deviceId ? "âœ“ " : ""}
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
                        {selectedLanguage === lang.value ? "âœ“ " : ""}
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