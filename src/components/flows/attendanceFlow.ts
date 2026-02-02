/**
 * Unified Attendance Flow - Voice & Text Compatible
 * Handles bulk attendance marking for class teachers (current date only)
 * 
 * This replaces the complex scattered attendance logic in AudioStreamerChatBot
 * with a clean, unified flow that works seamlessly for:
 * - Text-based attendance
 * - Voice-based attendance
 * - Image/OCR-based attendance
 * 
 * Flow: INIT -> COLLECTING -> REVIEW -> COMPLETED
 */

import { aiAPI } from "../../services/api";

const ATTENDANCE_ERR = "Sorry, there was an error processing your attendance request.";

// ============= TYPES =============
export type AttendanceStep = "init" | "collecting" | "review" | "completed";

export interface ClassInfo {
  class_: string;
  section: string;
  date: string;
}

export interface AttendanceRecord {
  student_name: string;
  attendance_status: "Present" | "Absent";
}

export interface AttendanceState {
  step: AttendanceStep;
  classInfo: ClassInfo | null;
  attendanceData: AttendanceRecord[];
  isVoiceMode: boolean;
  isEditing: boolean;
  pendingImageFile: File | null;
}

export const INITIAL_ATTENDANCE_STATE: AttendanceState = {
  step: "init",
  classInfo: null,
  attendanceData: [],
  isVoiceMode: false,
  isEditing: false,
  pendingImageFile: null,
};

export interface AttendanceBotMessage {
  type: "bot";
  text?: string;
  answer?: string;
  activeTab?: "answer";
  attendance_summary?: AttendanceRecord[];
  class_info?: ClassInfo;
  buttons?: Array<{ label: string; action: () => void }>;
  bulkattandance?: boolean;
  finish_collecting?: boolean;
}

export interface AttendanceFlowCallbacks {
  appendBotMessage: (msg: AttendanceBotMessage) => void;
  updateLastBotMessage: (msg: Partial<AttendanceBotMessage>) => void;
  setAttendanceState: (state: Partial<AttendanceState>) => void;
  getAttendanceState: () => AttendanceState;
  setGlobalAttendanceData: (data: AttendanceRecord[]) => void;
  setGlobalClassInfo: (info: ClassInfo | null) => void;
  getGlobalAttendanceData: () => AttendanceRecord[];
  getGlobalClassInfo: () => ClassInfo | null;
  setEditingMessageIndex: (index: number | null) => void;
  getChatHistoryLength: () => number;
  exitFlow: () => void;
  setProcessing: (v: boolean) => void;
  playTTS: (index: number, text: string) => void;
}

export interface AttendanceChatParams {
  userMessage: string;
  sessionId: string;
  userId: string;
  isVoiceTriggered: boolean;
  callbacks: AttendanceFlowCallbacks;
}

// ============= VOICE COMMAND PATTERNS =============
// Backend-aligned: edit attendance, approve, reject (voice-friendly)
export const BULK_PATTERNS = {
  ALL_PRESENT: /^(mark\s+)?all\s+(students?\s+)?present$/i,
  ALL_ABSENT: /^(mark\s+)?all\s+(students?\s+)?absent$/i,
  ALL_PRESENT_EXCEPT: /^(mark\s+)?all\s+(students?\s+)?present\s+except\s+(.+)$/i,
  ALL_ABSENT_EXCEPT: /^(mark\s+)?all\s+(students?\s+)?absent\s+except\s+(.+)$/i,
  DONE: /^(done|finished|that's all|no more|complete|submit)$/i,
  APPROVE: /^(approve|approved|yes|ok|confirm|save|submit)$/i,
  REJECT: /^(reject|rejected|no|cancel)$/i,
  EDIT_ATTENDANCE: /^(edit|edit attendance|change|change attendance)$/i,
  EXIT: /^(exit|quit|stop|restart|back|close)$/i,
};

// ============= FLOW DETECTION =============
export function isAttendanceIntent(message: string): boolean {
  const lowerMsg = message.toLowerCase();
  const patterns = [
    "mark attendance",
    "take attendance",
    "attendance for",
    "mark all present",
    "mark all absent",
    "bulk attendance",
    "student attendance",
    "class attendance",
  ];
  return patterns.some((p) => lowerMsg.includes(p));
}

export function shouldExitAttendanceFlow(message: string): boolean {
  return BULK_PATTERNS.EXIT.test(message.trim());
}

export function isApprovalMessage(message: string): boolean {
  return BULK_PATTERNS.APPROVE.test(message.trim());
}

export function isRejectionMessage(message: string): boolean {
  return BULK_PATTERNS.REJECT.test(message.trim());
}

export function isDoneMessage(message: string): boolean {
  return BULK_PATTERNS.DONE.test(message.trim());
}

// ============= TTS SUMMARY GENERATOR =============
export function generateAttendanceTTSSummary(
  answer: string,
  attendanceData?: AttendanceRecord[],
  classInfo?: ClassInfo
): string {
  const lowerAnswer = answer.toLowerCase();

  // Class info confirmation
  if (
    lowerAnswer.includes("ready to mark attendance") ||
    lowerAnswer.includes("class information confirmed")
  ) {
    if (classInfo) {
      return `Ready to mark attendance for Class ${classInfo.class_} ${classInfo.section} on ${classInfo.date}. Please provide student details.`;
    }
    return "Class information confirmed. Please provide student attendance.";
  }

  // Attendance summary ready (backend voice-friendly: edit attendance, approve, reject)
  if (
    attendanceData &&
    attendanceData.length > 0 &&
    (lowerAnswer.includes("here is the attendance summary") ||
      lowerAnswer.includes("check attendance") ||
      lowerAnswer.includes("attendance summary") ||
      lowerAnswer.includes("student name"))
  ) {
    const presentCount = attendanceData.filter(
      (s) => s.attendance_status?.toLowerCase() === "present"
    ).length;
    const total = attendanceData.length;
    const absentCount = total - presentCount;
    return `Attendance summary ready. ${total} students total. ${presentCount} present, ${absentCount} absent. You can say edit attendance to change any student, approve to save, or reject to start over.`;
  }

  // Success message (backend: "Attendance marked successfully.")
  if (
    lowerAnswer.includes("attendance marked successfully") ||
    lowerAnswer.includes("successfully") ||
    lowerAnswer.includes("attendance saved")
  ) {
    return "Attendance marked successfully.";
  }

  // Error message
  if (lowerAnswer.includes("error") || lowerAnswer.includes("failed")) {
    return "An error occurred while processing attendance. Please try again.";
  }

  // Prompt for student details
  if (
    lowerAnswer.includes("please provide") &&
    lowerAnswer.includes("student")
  ) {
    return "Please provide student names and attendance status. You can say mark all present or list individual students.";
  }

  // Default: return truncated answer
  return answer.substring(0, 150);
}

// ============= PARSE ATTENDANCE FROM TABLE =============
export function parseAttendanceFromTable(answer: string): AttendanceRecord[] {
  const result: AttendanceRecord[] = [];

  // Check if the answer contains a markdown table
  if (!answer.includes("| Student Name |") && !answer.includes("| Attendance Status |")) {
    return result;
  }

  const lines = answer.split("\n");
  for (const line of lines) {
    // Skip header and separator lines
    if (
      line.includes("Student Name") ||
      line.includes("---") ||
      !line.includes("|")
    ) {
      continue;
    }

    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length >= 2) {
      const studentName = cells[0];
      const status = cells[1];

      if (studentName && status) {
        result.push({
          student_name: studentName,
          attendance_status: status.toLowerCase().includes("present")
            ? "Present"
            : "Absent",
        });
      }
    }
  }

  return result;
}

// ============= CREATE REVIEW BUTTONS =============
export function createReviewButtons(
  callbacks: AttendanceFlowCallbacks,
  attendanceData: AttendanceRecord[],
  classInfo: ClassInfo | null,
  sessionId: string,
  userId: string,
  isVoiceTriggered: boolean
): Array<{ label: string; action: () => void }> {
  return [
    {
      label: "✏️ Edit Attendance",
      action: () => {
        console.log("Edit Attendance clicked");
        callbacks.setGlobalAttendanceData([...attendanceData]);
        callbacks.setGlobalClassInfo(classInfo);
        callbacks.setEditingMessageIndex(callbacks.getChatHistoryLength() - 1);
        callbacks.setAttendanceState({ isEditing: true });
        callbacks.appendBotMessage({
          type: "bot",
          text: "✅ Edit mode activated! You can now modify the attendance data.",
        });
      },
    },
    {
      label: "✅ Approve",
      action: async () => {
        console.log("Approve Attendance clicked");
        // IMPORTANT: Fetch current global state at click time, not captured stale data.
        // This ensures edited changes are captured when user clicks Approve after editing.
        const currentAttendanceData = callbacks.getGlobalAttendanceData();
        const currentClassInfo = callbacks.getGlobalClassInfo();
        // Use current global state if available (user edited), else fall back to original captured data
        const dataToUse = currentAttendanceData.length > 0 ? currentAttendanceData : attendanceData;
        const classInfoToUse = currentClassInfo ?? classInfo;
        console.log("Approve using data:", { dataToUse: dataToUse.length, classInfoToUse });
        await handleAttendanceApproval({
          sessionId,
          userId,
          attendanceData: dataToUse,
          classInfo: classInfoToUse,
          isVoiceTriggered,
          callbacks,
        });
      },
    },
    {
      label: "❌ Reject",
      action: () => {
        console.log("Reject Attendance clicked");
        handleAttendanceRejection(callbacks, isVoiceTriggered);
      },
    },
  ];
}

// ============= MAIN FLOW HANDLER =============
// Backend-driven: every message goes to backend; UI only renders response (voice-friendly).
export async function handleAttendanceChat(
  params: AttendanceChatParams
): Promise<void> {
  const { userMessage, sessionId, userId, isVoiceTriggered, callbacks } = params;
  const state = callbacks.getAttendanceState();
  const msg = userMessage.trim();

  // Handle exit commands first
  if (shouldExitAttendanceFlow(msg) && state.step !== "init") {
    callbacks.appendBotMessage({
      type: "bot",
      text: "Attendance flow cancelled. Feel free to ask anything else!",
    });
    if (isVoiceTriggered) {
      callbacks.playTTS(-1, "Attendance flow cancelled.");
    }
    callbacks.exitFlow();
    return;
  }

  try {
    callbacks.setProcessing(true);
    const response = await aiAPI.chat({
      session_id: sessionId,
      query: msg,
      user_id: userId,
    });

    if (response.status === "success" && response.data) {
      const { answer, class_info, attendance_summary, edit_mode } = response
        .data as any;
      const lowerAnswer = (answer ?? "").toLowerCase();
      const isEditMode =
        edit_mode === true ||
        lowerAnswer.startsWith("edit mode") ||
        lowerAnswer.startsWith("updated.") ||
        lowerAnswer.includes("say a student name and present or absent");
      const finalClassInfo: ClassInfo | null = class_info
        ? {
            class_: class_info.class_,
            section: class_info.section,
            date: class_info.date || new Date().toISOString().split("T")[0],
          }
        : state.classInfo;

      if (finalClassInfo && (state.step === "init" || !state.classInfo)) {
        callbacks.setAttendanceState({
          step: "collecting",
          classInfo: finalClassInfo,
        });
        callbacks.setGlobalClassInfo(finalClassInfo);
      }

      // Only treat as summary/review when we're NOT in edit mode.
      if (attendance_summary && attendance_summary.length > 0 && !isEditMode) {
        callbacks.setAttendanceState({
          step: "review",
          attendanceData: attendance_summary,
          classInfo: finalClassInfo ?? state.classInfo,
        });
        callbacks.setGlobalAttendanceData(attendance_summary);
        callbacks.setGlobalClassInfo(finalClassInfo ?? state.classInfo ?? null);

        const buttons = createReviewButtons(
          callbacks,
          attendance_summary,
          finalClassInfo ?? state.classInfo,
          sessionId,
          userId,
          isVoiceTriggered
        );

        callbacks.appendBotMessage({
          type: "bot",
          answer: answer ?? generateAttendanceSummaryMessage(attendance_summary, finalClassInfo ?? state.classInfo),
          attendance_summary,
          class_info: finalClassInfo ?? state.classInfo ?? undefined,
          buttons,
          bulkattandance: response.data.bulkattandance,
          finish_collecting: true,
        });

        if (isVoiceTriggered) {
          callbacks.playTTS(
            -1,
            generateAttendanceTTSSummary(answer ?? "", attendance_summary, finalClassInfo ?? state.classInfo ?? undefined)
          );
        }
      } else {
        const text = answer ?? "Please provide student attendance details.";
        callbacks.appendBotMessage({
          type: "bot",
          text,
          class_info: finalClassInfo ?? undefined,
        });
        if (isVoiceTriggered) {
          callbacks.playTTS(-1, generateAttendanceTTSSummary(text, undefined, finalClassInfo ?? state.classInfo ?? undefined));
        }
      }

      if (answer && /attendance marked successfully/i.test(answer)) {
        callbacks.setAttendanceState({ step: "completed" });
        setTimeout(() => callbacks.exitFlow(), 1500);
      }
    } else {
      const errMsg = response.message || ATTENDANCE_ERR;
      callbacks.appendBotMessage({ type: "bot", text: errMsg });
      if (isVoiceTriggered) callbacks.playTTS(-1, errMsg);
    }
  } catch (err) {
    console.error("Attendance flow error:", err);
    callbacks.appendBotMessage({ type: "bot", text: ATTENDANCE_ERR });
    if (isVoiceTriggered) callbacks.playTTS(-1, ATTENDANCE_ERR);
  } finally {
    callbacks.setProcessing(false);
  }
}

// ============= GENERATE SUMMARY MESSAGE =============
function generateAttendanceSummaryMessage(
  attendanceData: AttendanceRecord[],
  classInfo: ClassInfo | null
): string {
  if (!attendanceData || attendanceData.length === 0) {
    return "No attendance data to display.";
  }

  const header = "| Student Name | Attendance Status |\n|--------------|------------------|";
  const rows = attendanceData
    .map((entry) => `| ${entry.student_name} | ${entry.attendance_status} |`)
    .join("\n");
  const summary = `${header}\n${rows}`;

  const classStr = classInfo
    ? `Class ${classInfo.class_} ${classInfo.section} on ${classInfo.date}`
    : "the class";

  return `Here is the attendance summary for ${classStr}.\n\n${summary}\n\nYou can say: edit attendance to change any student, approve to save, or reject to start over.`;
}

// ============= APPROVAL HANDLER =============
interface ApprovalParams {
  sessionId: string;
  userId: string;
  attendanceData: AttendanceRecord[];
  classInfo: ClassInfo | null;
  isVoiceTriggered: boolean;
  callbacks: AttendanceFlowCallbacks;
}

async function handleAttendanceApproval(params: ApprovalParams): Promise<void> {
  const { sessionId, userId, attendanceData, classInfo, isVoiceTriggered, callbacks } = params;

  if (!attendanceData || attendanceData.length === 0) {
    callbacks.appendBotMessage({
      type: "bot",
      text: "❌ No attendance data found. Please provide attendance information first.",
    });
    return;
  }

  // Show processing message
  callbacks.appendBotMessage({
    type: "bot",
    text: "⏳ Saving attendance to database...",
  });

  try {
    // Send approval to backend with attendance data
    const response = await aiAPI.chat({
      session_id: sessionId,
      query: `approve_attendance: ${JSON.stringify({
        attendance_summary: attendanceData,
        class_info: classInfo,
      })}`,
      user_id: userId,
    });

    if (response.status === "success") {
      const successMessage = `✅ Attendance saved successfully! ${
        response.data?.answer || `${attendanceData.length} records saved.`
      }`;

      callbacks.appendBotMessage({
        type: "bot",
        text: successMessage,
      });

      if (isVoiceTriggered) {
        callbacks.playTTS(-1, "Attendance marked successfully.");
      }

      // Update state to completed
      callbacks.setAttendanceState({ step: "completed" });

      // Clear global state
      callbacks.setGlobalAttendanceData([]);
      callbacks.setGlobalClassInfo(null);
      callbacks.setEditingMessageIndex(null);

      // Exit flow after brief delay
      setTimeout(() => {
        callbacks.exitFlow();
      }, 1500);
    } else {
      throw new Error(response.message || "Failed to save attendance");
    }
  } catch (err) {
    console.error("Approval error:", err);
    callbacks.appendBotMessage({
      type: "bot",
      text: `❌ Failed to save attendance: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`,
    });

    if (isVoiceTriggered) {
      callbacks.playTTS(-1, "Failed to save attendance. Please try again.");
    }
  }
}

// ============= REJECTION HANDLER =============
function handleAttendanceRejection(
  callbacks: AttendanceFlowCallbacks,
  isVoiceTriggered: boolean
): void {
  // Reset to collecting step
  callbacks.setAttendanceState({
    step: "collecting",
    attendanceData: [],
    isEditing: false,
  });

  // Clear global state
  callbacks.setGlobalAttendanceData([]);
  callbacks.setEditingMessageIndex(null);

  callbacks.appendBotMessage({
    type: "bot",
    text: '❌ Attendance rejected. Please provide new attendance data.\n\nYou can:\n• Say "Mark all present" or "Mark all absent"\n• Say "All present except [names]"\n• List individual students',
    buttons: [
      {
        label: "📤 Upload Image",
        action: () => {
          // Trigger file input click
          const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
          if (fileInput) {
            fileInput.click();
          }
        },
      },
    ],
  });

  if (isVoiceTriggered) {
    callbacks.playTTS(-1, "Attendance rejected. Please provide new attendance data.");
  }
}

// ============= IMAGE PROCESSING HANDLER =============
export async function handleAttendanceImageUpload(params: {
  file: File;
  sessionId: string;
  userId: string;
  classInfo: ClassInfo;
  isVoiceTriggered: boolean;
  callbacks: AttendanceFlowCallbacks;
}): Promise<void> {
  const { file, sessionId, userId, classInfo, isVoiceTriggered, callbacks } = params;

  callbacks.appendBotMessage({
    type: "bot",
    text: "🔄 Processing image... Please wait while I extract attendance information.",
  });

  try {
    const response = await aiAPI.processAttendanceImage({
      file,
      session_id: sessionId,
      class_: classInfo.class_,
      section: classInfo.section,
      date: classInfo.date,
    });

    if (
      response.status === "success" &&
      response.data?.attendance_summary &&
      response.data.attendance_summary.length > 0
    ) {
      const attendanceData = response.data.attendance_summary;
      const answer = response.data.message ?? generateAttendanceSummaryMessage(attendanceData, classInfo);

      callbacks.setAttendanceState({
        step: "review",
        attendanceData,
        classInfo,
      });
      callbacks.setGlobalAttendanceData(attendanceData);

      const buttons = createReviewButtons(
        callbacks,
        attendanceData,
        classInfo,
        sessionId,
        userId,
        isVoiceTriggered
      );

      callbacks.appendBotMessage({
        type: "bot",
        answer,
        attendance_summary: attendanceData,
        class_info: classInfo,
        buttons,
      });

      if (isVoiceTriggered) {
        callbacks.playTTS(
          -1,
          generateAttendanceTTSSummary("Attendance summary ready", attendanceData, classInfo)
        );
      }
    } else {
      callbacks.appendBotMessage({
        type: "bot",
        text:
          response.message ||
          "Could not extract attendance from image. Please try again or provide attendance data manually.",
      });
    }
  } catch (err) {
    console.error("Image processing error:", err);
    callbacks.appendBotMessage({
      type: "bot",
      text: "Failed to process image. Please try again or provide attendance data manually.",
    });

    if (isVoiceTriggered) {
      callbacks.playTTS(-1, "Image processing failed. Please try again.");
    }
  }
}

// ============= VOICE CLASS INFO HANDLER =============
export async function handleVoiceClassInfo(params: {
  voiceText: string;
  sessionId: string;
  userId?: string;
  callbacks: AttendanceFlowCallbacks;
}): Promise<ClassInfo | null> {
  const { voiceText, sessionId, userId, callbacks } = params;

  try {
    const response = await aiAPI.processVoiceClassInfo({
      session_id: sessionId,
      voice_text: voiceText,
      user_id: userId,
    });

    if (response.status === "success" && response.data?.class_info) {
      const classInfo = response.data.class_info;
      callbacks.setAttendanceState({
        step: "collecting",
        classInfo,
      });
      callbacks.setGlobalClassInfo(classInfo);
      return classInfo;
    }

    return null;
  } catch (err) {
    console.error("Voice class info error:", err);
    return null;
  }
}

// ============= SAVE EDITED ATTENDANCE =============
export function handleSaveEditedAttendance(params: {
  editedData: AttendanceRecord[];
  messageIndex: number;
  sessionId: string;
  userId: string;
  isVoiceTriggered: boolean;
  callbacks: AttendanceFlowCallbacks;
}): void {
  const { editedData, callbacks } = params;

  // Update state with edited data
  callbacks.setAttendanceState({
    attendanceData: editedData,
    isEditing: false,
  });
  callbacks.setGlobalAttendanceData(editedData);
  callbacks.setEditingMessageIndex(null);

  callbacks.appendBotMessage({
    type: "bot",
    text: `✅ Changes saved! Updated ${editedData.length} attendance records. Click Approve to save to database or Edit to make more changes.`,
  });
}

// ============= CANCEL EDIT =============
export function handleCancelEdit(callbacks: AttendanceFlowCallbacks): void {
  callbacks.setAttendanceState({ isEditing: false });
  callbacks.setEditingMessageIndex(null);

  callbacks.appendBotMessage({
    type: "bot",
    text: "Edit cancelled. Click Approve to save the original attendance or Edit to try again.",
  });
}
