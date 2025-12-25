/**
 * chatFlows.ts
 *
 * RESPONSIBILITY: All chatbot flows
 * - Attendance (text + voice + OCR)
 * - Leave
 * - Leave approval
 * - Assignment
 * - Course progress
 * - Query fallback
 * - No React imports
 */

import { aiAPI, leaveApprovalAPI, courseProgressAPI } from "../services/api";
import type { FlowType } from "./chatRouter";

export interface FlowContext {
  sessionId: string | null;
  userId: string;
  roles: string;
  activeFlow: FlowType;
  attendanceStep: "class_info" | "student_details" | "completed";
  pendingClassInfo: any;
  classSections: any[];
  selectedClassSection: any;
  leaveApprovalRequests: any[];
  loadingLeaveRequests: boolean;
  isVoiceInput?: boolean;
}

export interface FlowResult {
  success: boolean;
  message?: any;
  data?: any;
  shouldUpdateFlow?: boolean;
  shouldUpdateStep?: "class_info" | "student_details" | "completed";
  shouldUpdateClassInfo?: any;
  shouldUpdateAttendanceData?: any[];
  shouldUpdateClassSections?: any[];
  shouldUpdateSelectedClassSection?: any;
  shouldUpdateLeaveRequests?: any[];
  buttons?: { label: string; action: () => void }[];
}

/**
 * Get ERP context (academic session and branch token)
 */
const getErpContext = () => {
  const academic_session =
    localStorage.getItem("academic_session") || "2025-26";
  const branch_token = localStorage.getItem("branch_token") || "demo";
  return { academic_session, branch_token };
};

/**
 * Query flow - General AI query handler
 */
export const handleQueryFlow = async (
  userMessage: string,
  context: FlowContext
): Promise<FlowResult> => {
  try {
    const data = await aiAPI.queryHandler({
      user_id: context.userId,
      user_roles: context.roles,
      query: userMessage,
    });

    if (data.status === "success" && data.data) {
      return {
        success: true,
        message: {
          type: "bot",
          answer: data.data?.answer,
          references: data.data?.references,
          mongodbquery: data.data?.mongodbquery,
          activeTab: "answer",
        },
      };
    } else if (data.status === "error" && data.message) {
      return {
        success: false,
        message: {
          type: "bot",
          text: data.message,
        },
      };
    } else {
      return {
        success: false,
        message: {
          type: "bot",
          text: "No response from AI.",
        },
      };
    }
  } catch (err) {
    return {
      success: false,
      message: {
        type: "bot",
        text: "Sorry, there was an error processing your query.",
      },
    };
  }
};

/**
 * Attendance flow - Text-based attendance
 */
export const handleAttendanceFlow = async (
  userMessage: string,
  context: FlowContext
): Promise<FlowResult> => {
  const { attendanceStep, pendingClassInfo } = context;

  if (attendanceStep === "class_info") {
    // First step: Collect class information
    try {
      const data = await aiAPI.chat({
        session_id: context.sessionId || context.userId,
        query: `Extract class information from: "${userMessage}". Please identify and extract:
          1. Class name/number (e.g., 6, 10, Class 6, Grade 6, Standard 6, Nursery, KG, Pre-K, LKG, UKG, etc.)
          2. Section (e.g., A, B, C, Section A, etc.) 
          3. Date (any format: 2025-01-15, 15/01/2025, Jan 15 2025, 15th January 2025, 5 August 2025, etc.)
          
          Return the information in a structured format with class_info object containing class_, section, and date fields. If any information is missing, ask for clarification.`,
      });

      if (data.status === "success" && data.data) {
        const classInfo = data.data.class_info;
        const answer = data.data.answer || "";

        // Enhanced validation for class information
        if (
          classInfo &&
          classInfo.class_ &&
          classInfo.section &&
          classInfo.date
        ) {
          return {
            success: true,
            message: {
              type: "bot",
              text: `✅ Class information confirmed: Class ${classInfo.class_} ${classInfo.section} on ${classInfo.date}. Now please provide student details for attendance. You can type the student names and their attendance status, or upload an image with the attendance list.`,
            },
            shouldUpdateStep: "student_details",
            shouldUpdateClassInfo: classInfo,
          };
        } else {
          // Enhanced parsing from the answer text if structured data is not available
          let classMatch = answer.match(/class[:\s]*(\w+)/i);
          let sectionMatch = answer.match(/section[:\s]*(\w+)/i);
          let dateMatch = answer.match(
            /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i
          );

          // If no matches from answer, try parsing from user message directly
          if (!classMatch || !sectionMatch || !dateMatch) {
            classMatch =
              userMessage.match(
                /(?:class|grade|standard|nursery|kg|pre-k|prek|lkg|ukg)[:\s]*(\w+)/i
              ) ||
              userMessage.match(/(\w+)\s+(?:class|grade|standard)/i) ||
              userMessage.match(/(nursery|kg|pre-k|prek|lkg|ukg)/i) ||
              userMessage.match(/class\s+(\w+)/i) ||
              userMessage.match(/mark\s+attendance\s+for\s+class\s+(\w+)/i);

            sectionMatch =
              userMessage.match(/(?:section|sec)[:\s]*(\w+)/i) ||
              userMessage.match(/(\w+)\s+(?:section|sec)/i) ||
              userMessage.match(/\b([a-z])\b/i) ||
              userMessage.match(/class\s+\w+\s+(\w+)/i) ||
              userMessage.match(/nursery\s+(\w+)/i) ||
              userMessage.match(/for\s+(\w+)/i);

            dateMatch =
              userMessage.match(/(\d{4}-\d{2}-\d{2})/i) ||
              userMessage.match(/(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
              userMessage.match(
                /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i
              ) ||
              userMessage.match(
                /(\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})/i
              );
          }

          // Special handling for specific patterns
          if (!classMatch || !sectionMatch || !dateMatch) {
            const specificPatterns = [
              /class\s+(\w+)\s+(\w+)\s+for\s+(\d{1,2}\s+\w+\s+\d{4})/i,
              /class\s+(\w+)\s+section\s+(\w+)\s+(\d{4}-\d{2}-\d{2})/i,
              /mark\s+attendance\s+for\s+class\s+(\w+)\s+(\w+)\s+for\s+(\d{1,2}\s+\w+\s+\d{4})/i,
            ];

            for (const pattern of specificPatterns) {
              const match = userMessage.match(pattern);
              if (match && match[1] && match[2] && match[3]) {
                classMatch = match;
                sectionMatch = match;
                dateMatch = match;
                break;
              }
            }
          }

          if (classMatch && sectionMatch && dateMatch) {
            const extractedClassInfo = {
              class_: classMatch[1].toUpperCase(),
              section: sectionMatch[1].toUpperCase(),
              date: dateMatch[1],
            };

            return {
              success: true,
              message: {
                type: "bot",
                text: `✅ Class information confirmed: Class ${extractedClassInfo.class_} ${extractedClassInfo.section} on ${extractedClassInfo.date}. Now please provide student details for attendance.`,
              },
              shouldUpdateStep: "student_details",
              shouldUpdateClassInfo: extractedClassInfo,
            };
          } else {
            return {
              success: false,
              message: {
                type: "bot",
                text: `I need more specific class information. Please provide:\n• Class/Standard/Grade (e.g., 6, Class 6, Grade 6, Standard 6, Nursery, KG, Pre-K)\n• Section (e.g., A, B, C, Section A)\n• Date (e.g., 2025-01-15, 15/01/2025, Jan 15 2025)\n\nExamples: "Class 6 A on 2025-01-15", "Nursery B on 2025-08-14", or "Grade 10 Section B for 15th January 2025"`,
              },
            };
          }
        }
      } else {
        return {
          success: false,
          message: {
            type: "bot",
            text:
              data.data?.answer || "Please provide class information clearly.",
          },
        };
      }
    } catch (err) {
      return {
        success: false,
        message: {
          type: "bot",
          text: "Sorry, there was an error processing your request. Please try again.",
        },
      };
    }
  } else if (attendanceStep === "student_details") {
    // Second step: Collect student details
    try {
      const data = await aiAPI.chat({
        session_id: context.sessionId || context.userId,
        query: `Process and verify attendance for ${
          pendingClassInfo
            ? `Class ${pendingClassInfo.class_} ${pendingClassInfo.section} on ${pendingClassInfo.date}`
            : "the class"
        }: ${userMessage}. Please extract student names and attendance status, and verify the information for accuracy.`,
      });

      if (data.status === "success" && data.data) {
        let parsedAttendanceData = data.data.attendance_summary;
        let parsedClassInfo = pendingClassInfo || data.data.class_info;

        // Parse markdown table if present
        const answer = data.data.answer || "";
        if (
          answer.includes("| Student Name |") &&
          answer.includes("| Attendance Status |")
        ) {
          const lines = answer.split("\n");
          const tableStartIndex = lines.findIndex((line: string) =>
            line.includes("| Student Name |")
          );
          if (tableStartIndex !== -1) {
            const tableLines = lines.slice(tableStartIndex + 2);
            const extractedData: any[] = [];

            for (const line of tableLines) {
              if (line.includes("|") && !line.includes("---")) {
                const cells = line
                  .split("|")
                  .map((cell: string) => cell.trim())
                  .filter((cell: string) => cell);
                if (cells.length >= 2) {
                  extractedData.push({
                    student_name: cells[0],
                    attendance_status: cells[1],
                  });
                }
              }
            }

            if (extractedData.length > 0) {
              parsedAttendanceData = extractedData;
            }
          }
        }

        return {
          success: true,
          message: {
            type: "bot",
            answer: data.data?.answer,
            references: data.data?.references,
            mongodbquery: data.data?.mongodbquery,
            activeTab: "answer",
            attendance_summary: parsedAttendanceData,
            class_info: parsedClassInfo,
            bulkattandance: data.data?.bulkattandance,
            finish_collecting: data.data?.finish_collecting,
          },
          shouldUpdateStep: "completed",
          shouldUpdateAttendanceData: parsedAttendanceData,
          shouldUpdateClassInfo: parsedClassInfo,
        };
      } else {
        return {
          success: false,
          message: {
            type: "bot",
            text:
              data.data?.answer || "Please provide student details clearly.",
          },
        };
      }
    } catch (err) {
      return {
        success: false,
        message: {
          type: "bot",
          text: "Sorry, there was an error processing your attendance request.",
        },
      };
    }
  }

  return {
    success: false,
    message: {
      type: "bot",
      text: "Invalid attendance step.",
    },
  };
};

/**
 * Voice attendance flow
 */
export const handleVoiceAttendanceFlow = async (
  userMessage: string,
  context: FlowContext
): Promise<FlowResult> => {
  const { attendanceStep, pendingClassInfo } = context;

  if (attendanceStep === "class_info") {
    try {
      const data = await aiAPI.processVoiceClassInfo({
        session_id: context.sessionId || context.userId,
        voice_text: userMessage,
      });

      if (data.status === "success" && data.data) {
        const classInfo = data.data.class_info;
        return {
          success: true,
          message: {
            type: "bot",
            text: `✅ ${
              data.data?.message || "Class information confirmed"
            } Now you can speak the student names and their attendance status. For example: "Aarav present, Diya absent" or "Mark all present except John".`,
          },
          shouldUpdateStep: "student_details",
          shouldUpdateClassInfo: classInfo,
        };
      } else {
        return {
          success: false,
          message: {
            type: "bot",
            text:
              data.message ||
              "Please provide class information clearly via voice.",
          },
        };
      }
    } catch (err) {
      return {
        success: false,
        message: {
          type: "bot",
          text: "Sorry, there was an error processing your voice input. Please try again.",
        },
      };
    }
  } else if (attendanceStep === "student_details") {
    try {
      const data = await aiAPI.processVoiceAttendance({
        session_id: context.sessionId || context.userId,
        voice_text: userMessage,
        class_info: pendingClassInfo,
      });

      if (data.status === "success" && data.data) {
        const parsedAttendanceData = data.data.attendance_summary;
        const parsedClassInfo = pendingClassInfo || data.data.class_info;

        return {
          success: true,
          message: {
            type: "bot",
            answer: data.data.answer,
            activeTab: "answer",
            attendance_summary: parsedAttendanceData,
            class_info: parsedClassInfo,
            voice_processed: data.data.voice_processed,
          },
          shouldUpdateStep: "completed",
          shouldUpdateAttendanceData: parsedAttendanceData,
          shouldUpdateClassInfo: parsedClassInfo,
        };
      } else {
        return {
          success: false,
          message: {
            type: "bot",
            text:
              data.message ||
              "Please provide student attendance information clearly via voice.",
          },
        };
      }
    } catch (err) {
      return {
        success: false,
        message: {
          type: "bot",
          text: "Sorry, there was an error processing your voice attendance request.",
        },
      };
    }
  }

  return {
    success: false,
    message: {
      type: "bot",
      text: "Invalid voice attendance step.",
    },
  };
};

/**
 * Full voice attendance flow
 */
export const handleFullVoiceAttendanceFlow = async (
  userMessage: string,
  context: FlowContext
): Promise<FlowResult> => {
  try {
    // Check if this is the first message (start flow)
    if (!context.pendingClassInfo) {
      const data = await aiAPI.startFullVoiceAttendance({
        session_id: context.sessionId || context.userId,
      });

      if (data.status === "success") {
        return {
          success: true,
          message: {
            type: "bot",
            text:
              data.data?.message ||
              "Full voice attendance flow started. Please speak the class information and student attendance.",
          },
        };
      }
    }

    // Process voice input
    const data = await aiAPI.processFullVoiceAttendance({
      session_id: context.sessionId || context.userId,
      voice_text: userMessage,
    });

    if (data.status === "success" && data.data) {
      const parsedAttendanceData = data.data.attendance_summary;
      const parsedClassInfo = data.data.class_info;

      if (parsedAttendanceData && parsedAttendanceData.length > 0) {
        return {
          success: true,
          message: {
            type: "bot",
            answer: data.data.answer || data.data.message,
            activeTab: "answer",
            attendance_summary: parsedAttendanceData,
            class_info: parsedClassInfo,
            voice_processed: true,
          },
          shouldUpdateStep: "completed",
          shouldUpdateAttendanceData: parsedAttendanceData,
          shouldUpdateClassInfo: parsedClassInfo,
        };
      } else {
        return {
          success: true,
          message: {
            type: "bot",
            text:
              data.data.message ||
              "Please continue speaking the attendance information.",
          },
        };
      }
    } else {
      return {
        success: false,
        message: {
          type: "bot",
          text:
            data.message ||
            "Please provide attendance information clearly via voice.",
        },
      };
    }
  } catch (err) {
    return {
      success: false,
      message: {
        type: "bot",
        text: "Sorry, there was an error processing your full voice attendance request.",
      },
    };
  }
};

/**
 * Leave flow
 */
export const handleLeaveFlow = async (
  userMessage: string,
  context: FlowContext
): Promise<FlowResult> => {
  try {
    const authToken = localStorage.getItem("token");
    const { academic_session, branch_token } = getErpContext();

    const data = await aiAPI.leaveChat({
      session_id: context.sessionId || context.userId,
      user_id: context.userId,
      query: userMessage,
      bearer_token: authToken || undefined,
      academic_session,
      branch_token,
    });

    if (data.status === "success" && data.data) {
      const answer = data.data.answer || "";

      // Check if submission succeeded
      const shouldExit =
        answer.includes("✅") && answer.includes("successfully");

      return {
        success: true,
        message: {
          type: "bot",
          answer: answer,
          activeTab: "answer",
        },
        shouldUpdateFlow: shouldExit ? true : undefined,
      };
    } else {
      return {
        success: false,
        message: {
          type: "bot",
          text:
            data.message ||
            "Sorry, there was an error processing your leave request.",
        },
      };
    }
  } catch (err) {
    return {
      success: false,
      message: {
        type: "bot",
        text: "Sorry, there was an error processing your leave request.",
      },
    };
  }
};

/**
 * Assignment flow
 */
export const handleAssignmentFlow = async (
  userMessage: string,
  context: FlowContext
): Promise<FlowResult> => {
  try {
    const authToken = localStorage.getItem("token");
    const { academic_session, branch_token } = getErpContext();

    console.log(
      "[chatFlows] 📤 Calling assignment API with is_voice_input:",
      context.isVoiceInput
    );

    const data = await aiAPI.assignmentChat({
      session_id: context.sessionId || context.userId,
      user_id: context.userId,
      query: userMessage,
      bearer_token: authToken || undefined,
      academic_session,
      branch_token,
      is_voice_input: context.isVoiceInput || false,
    });

    console.log("[chatFlows] 📥 API response received:", {
      status: data.status,
      hasData: !!data.data,
      answer: data.data?.answer?.substring(0, 50),
      flow_status: data.data?.flow_status,
      keep_listening: data.data?.keep_listening,
      play_audio: data.data?.play_audio,
    });

    if (data.status === "success" && data.data) {
      const answer = data.data.answer || "";

      // Check if submission succeeded
      const shouldExit =
        (answer.includes("✅") &&
          answer.includes("successfully") &&
          answer.includes("created")) ||
        answer.includes("❌") ||
        answer.includes("error") ||
        answer.includes("failed");

      // FIXED: Include flow signals from backend in the message
      const result = {
        success: true,
        message: {
          type: "bot",
          answer: answer,
          activeTab: "answer",
          // Pass flow signals through to the component
          data: {
            keep_listening: data.data.keep_listening,
            flow_status: data.data.flow_status,
            fields_remaining: data.data.fields_remaining,
            play_audio: data.data.play_audio,
          },
        },
        shouldUpdateFlow: shouldExit ? true : undefined,
      };

      console.log("[chatFlows] 📦 Returning flow result with signals:", {
        flow_status: result.message.data.flow_status,
        keep_listening: result.message.data.keep_listening,
        play_audio: result.message.data.play_audio,
      });

      return result;
    } else {
      return {
        success: false,
        message: {
          type: "bot",
          text:
            data.message ||
            "Sorry, there was an error processing your assignment request.",
        },
      };
    }
  } catch (err) {
    return {
      success: false,
      message: {
        type: "bot",
        text: "Sorry, there was an error processing your assignment request.",
      },
    };
  }
};

/**
 * Course progress flow
 */
export const handleCourseProgressFlow = async (
  _userMessage: string,
  context: FlowContext
): Promise<FlowResult> => {
  try {
    if (context.classSections.length === 0) {
      // Fetch class sections if not already loaded
      const authToken = localStorage.getItem("token");
      const { academic_session, branch_token } = getErpContext();
      const response = await courseProgressAPI.fetchClassSections({
        page: 1,
        limit: 50,
        bearer_token: authToken || undefined,
        academic_session,
        branch_token,
      });

      if (
        (response.status === 200 || response.status === "success") &&
        response.data?.options
      ) {
        const options = response.data.options || [];
        return {
          success: true,
          message: {
            type: "bot",
            text: `📚 Found **${options.length}** class-section(s). Please select a class and section from the list above to view course progress.`,
            classSections: options,
          },
          shouldUpdateClassSections: options,
        };
      } else {
        return {
          success: false,
          message: {
            type: "bot",
            text:
              response.message || "No class sections found. Please try again.",
          },
        };
      }
    } else if (context.selectedClassSection) {
      // If a class section is already selected, refresh the progress
      const authToken = localStorage.getItem("token");
      const { academic_session, branch_token } = getErpContext();
      const progressResponse = await courseProgressAPI.getProgress({
        classId: context.selectedClassSection.classId,
        sectionId: context.selectedClassSection.sectionId,
        bearer_token: authToken || undefined,
        academic_session,
        branch_token,
      });

      if (
        ((progressResponse.status as any) === 200 ||
          progressResponse.status === "success") &&
        progressResponse.data
      ) {
        const progressData =
          (progressResponse.data as any).resp ||
          progressResponse.data.progress ||
          progressResponse.data;

        const teacherDiarys = progressData.teacherDiarys || progressData || [];
        const totalSubjects = Array.isArray(teacherDiarys)
          ? teacherDiarys.length
          : 0;
        const summaryText =
          totalSubjects > 0
            ? `📊 **Course Progress for ${
                context.selectedClassSection.className || "Class"
              } ${
                context.selectedClassSection.sectionName || "Section"
              }**\n\nFound **${totalSubjects}** subject(s) with progress tracking. See details below.`
            : `📊 **Course Progress for ${
                context.selectedClassSection.className || "Class"
              } ${
                context.selectedClassSection.sectionName || "Section"
              }**\n\nNo progress data available yet.`;

        return {
          success: true,
          message: {
            type: "bot",
            text: summaryText,
            courseProgress: progressData,
            classSection: {
              classId: context.selectedClassSection.classId,
              sectionId: context.selectedClassSection.sectionId,
              className: context.selectedClassSection.className,
              sectionName: context.selectedClassSection.sectionName,
            },
          },
        };
      } else {
        return {
          success: false,
          message: {
            type: "bot",
            text:
              progressResponse.message ||
              "Failed to fetch course progress. Please try again.",
          },
        };
      }
    } else {
      return {
        success: false,
        message: {
          type: "bot",
          text: "Please select a class and section from the list above to view course progress.",
        },
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: {
        type: "bot",
        text: `❌ Error: ${err.message || "Unknown error occurred"}`,
      },
    };
  }
};

/**
 * Leave approval flow
 */
export const handleLeaveApprovalFlow = async (
  _userMessage: string,
  context: FlowContext
): Promise<FlowResult> => {
  // Only fetch if we don't have requests already
  if (
    context.leaveApprovalRequests.length === 0 &&
    !context.loadingLeaveRequests
  ) {
    try {
      const authToken = localStorage.getItem("token");
      const { academic_session, branch_token } = getErpContext();

      const response = await leaveApprovalAPI.fetchPendingRequests({
        user_id: context.userId,
        page: 1,
        limit: 50,
        bearer_token: authToken || undefined,
        academic_session,
        branch_token,
      });

      if (response.status === 200 && response.data) {
        return {
          success: true,
          message: {
            type: "bot",
            answer: `📋 **Leave Approval Dashboard**\n\nFound **${response.data.leaveRequests.length}** pending leave request(s) for your approval.\n\nPlease review each request below and take action by either:\n- ✅ **Approve** - Click the green "Approve" button\n- ❌ **Reject** - Enter a rejection reason and click the red "Reject" button`,
            activeTab: "answer",
          },
          shouldUpdateLeaveRequests: response.data.leaveRequests || [],
        };
      } else {
        return {
          success: true,
          message: {
            type: "bot",
            answer: `✅ **No Pending Requests**\n\nThere are currently no pending leave requests requiring your approval.\n\nAll leave requests have been processed or there are no new requests at this time.`,
            activeTab: "answer",
          },
        };
      }
    } catch (err: any) {
      const errorMessage =
        err.message || err.response?.data?.message || "Unknown error occurred";
      return {
        success: false,
        message: {
          type: "bot",
          text: `❌ **Error Loading Leave Requests**\n\nSorry, there was an error fetching leave approval requests.\n\n**Error:** ${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
        },
      };
    }
  } else {
    return {
      success: true,
      message: {
        type: "bot",
        text: "You're in the Leave Approval flow. Please use the approve/reject buttons on the leave requests above to take action.",
      },
    };
  }
};

/**
 * Main flow router - routes to appropriate flow handler
 */
export const executeFlow = async (
  flow: FlowType,
  userMessage: string,
  context: FlowContext
): Promise<FlowResult> => {
  switch (flow) {
    case "query":
      return handleQueryFlow(userMessage, context);
    case "attendance":
      return handleAttendanceFlow(userMessage, context);
    case "voice_attendance":
      return handleVoiceAttendanceFlow(userMessage, context);
    case "full_voice_attendance":
      return handleFullVoiceAttendanceFlow(userMessage, context);
    case "leave":
      return handleLeaveFlow(userMessage, context);
    case "assignment":
      return handleAssignmentFlow(userMessage, context);
    case "course_progress":
      return handleCourseProgressFlow(userMessage, context);
    case "leave_approval":
      return handleLeaveApprovalFlow(userMessage, context);
    default:
      return {
        success: false,
        message: {
          type: "bot",
          text: "Please select an option from the menu, or I'll try to detect what you need automatically.",
        },
      };
  }
};
