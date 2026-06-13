/**
 * Chat message list: attendance step indicator, message map (user/bot, attendance table, leave approval, etc.), processing indicator.
 * Extracted from AudioStreamerChatBot to reduce main file size.
 */
import { motion } from "framer-motion";
import { FiThumbsDown, FiThumbsUp, FiVolume2 } from "react-icons/fi";
import { SlBubbles } from "react-icons/sl";
import MemoizedAnswer from "./MemoizedAnswer";
import VisualizationRenderer from "./VisualizationRenderer";
import { MarksEntryTable } from "./MarksEntryTable";
import { HealthCardTable } from "./HealthCardTable";
import { HealthCardSelector } from "./HealthCardSelector";
import type { FlowType } from "./types";
import { getThumbsUpClass, getThumbsDownClass } from "./utils/chatbotUtils";
import { leaveApprovalAPI, studentLeaveApprovalAPI } from "../services/api";
import type { ClassInfo, AttendanceRecord } from "./flows/attendanceFlow";

const formatStudentLeaveType = (leaveType: string): string => {
  if (!leaveType) return "Unknown";
  return leaveType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export interface ChatMessageListProps {
  chatBoxRef: React.RefObject<HTMLDivElement | null>;
  chatHistory: any[];
  activeFlow: FlowType;
  attendanceStep: "class_info" | "student_details" | "completed";
  isProcessing: boolean;
  ttsLoading: number | null;
  editingMessageIndex: number | null;
  setEditingMessageIndex: (v: number | null) => void;
  attendanceData: AttendanceRecord[];
  setAttendanceData: (
    v: AttendanceRecord[] | ((prev: AttendanceRecord[]) => AttendanceRecord[]),
  ) => void;
  classInfo: ClassInfo | null;
  setClassInfo: (v: ClassInfo | null) => void;
  showCorrectionBox: number | null;
  setShowCorrectionBox: (v: number | null) => void;
  feedbackComment: { [idx: number]: string };
  setFeedbackComment: React.Dispatch<
    React.SetStateAction<{ [idx: number]: string }>
  >;
  correctionBoxRef: React.RefObject<HTMLDivElement | null>;
  handlePlayTTS: (
    idx: number,
    text: string,
    isQuery?: boolean,
  ) => Promise<void>;
  handleSendFeedback: (
    idx: number,
    type: "Approved" | "Rejected",
    comment?: string,
  ) => Promise<void>;
  handleAttendanceDataChange: (
    index: number,
    field: string,
    value: string,
  ) => void;
  handleAddStudent: () => void;
  handleRemoveStudent: (index: number) => void;
  handleSaveAttendance: (messageIndex: number) => Promise<void>;
  handleSaveColumn?: (
    columnTitle: string,
    studentData: any[],
    sessionId?: string,
  ) => Promise<boolean>;
  handleUnifiedAttendanceApproval: (
    messageIndex?: number,
    attendanceType?: "text" | "image" | "voice",
    fallbackAttendanceData?: any[],
    fallbackClassInfo?: any,
  ) => Promise<void>;
  handleTextAttendanceRejection: () => void;
  setActiveFlow: (v: FlowType) => void;
  setAttendanceStep: (
    v: "class_info" | "student_details" | "completed",
  ) => void;
  setChatHistory: React.Dispatch<React.SetStateAction<any[]>>;
  leaveApprovalRequests: any[];
  setLeaveApprovalRequests: React.Dispatch<React.SetStateAction<any[]>>;
  loadingLeaveRequests: boolean;
  rejectReason: { [key: string]: string };
  setRejectReason: React.Dispatch<
    React.SetStateAction<{ [key: string]: string }>
  >;
  studentLeaveApprovalRequests: any[];
  setStudentLeaveApprovalRequests: React.Dispatch<React.SetStateAction<any[]>>;
  loadingStudentLeaveRequests: boolean;
  studentRejectReason: { [key: string]: string };
  setStudentRejectReason: React.Dispatch<
    React.SetStateAction<{ [key: string]: string }>
  >;
  userId: string;
  getErpContext: () => { academic_session: string; branch_token: string };
  onOpenPreview: (url: string, filename: string) => void;
  handleSubmit: (overrideMessage?: string) => Promise<void>;
  userRoles: string[];
  speakHealthCardBotMessage: (text: string) => void;
}

export default function ChatMessageList(props: ChatMessageListProps) {
  const {
    chatBoxRef,
    chatHistory,
    activeFlow,
    attendanceStep,
    isProcessing,
    ttsLoading,
    editingMessageIndex,
    setEditingMessageIndex,
    attendanceData,
    classInfo,
    showCorrectionBox,
    setShowCorrectionBox,
    feedbackComment,
    setFeedbackComment,
    correctionBoxRef,
    handlePlayTTS,
    handleSendFeedback,
    handleAttendanceDataChange,
    handleAddStudent,
    handleRemoveStudent,
    handleSaveAttendance,
    handleSaveColumn,
    setChatHistory,
    leaveApprovalRequests,
    setLeaveApprovalRequests,
    loadingLeaveRequests,
    rejectReason,
    setRejectReason,
    studentLeaveApprovalRequests,
    setStudentLeaveApprovalRequests,
    loadingStudentLeaveRequests,
    studentRejectReason,
    setStudentRejectReason,
    getErpContext,
    userId,
    onOpenPreview,
    handleSubmit,
    userRoles,
    speakHealthCardBotMessage,
  } = props;

  const lastHealthCardSectionsIdx = chatHistory.reduce(
    (acc, m, i) =>
      m.health_card_sections && Array.isArray(m.health_card_sections) && m.health_card_sections.length > 0
        ? i
        : acc,
    -1,
  );

  const leaveApprovalDashboardIdx = chatHistory.reduce(
    (acc, m, i) => (m.leaveApprovalDashboard ? i : acc),
    -1,
  );

  const studentLeaveApprovalDashboardIdx = chatHistory.reduce(
    (acc, m, i) => (m.studentLeaveApprovalDashboard ? i : acc),
    -1,
  );

  const speakLeaveActionResult = (text: string) => {
    void handlePlayTTS(-1, text.replace(/\*\*/g, ""));
  };

  return (
    <div className="chatbot-chatbox" ref={chatBoxRef}>
      {/* Attendance Flow Step Indicator - Mobile-friendly */}
      {(activeFlow === "attendance" || activeFlow === "voice_attendance") && (
        <div className="attendance-step-indicator bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4 overflow-x-auto">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-wrap sm:flex-nowrap">
            <div
              className={`flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${
                attendanceStep === "class_info"
                  ? "text-blue-600 font-semibold"
                  : "text-gray-600 font-normal"
              }`}
            >
              <span
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold flex-shrink-0 ${
                  attendanceStep === "class_info"
                    ? "bg-blue-600 text-white"
                    : "bg-blue-100 text-gray-600"
                }`}
              >
                {attendanceStep === "class_info" ? "1" : "✓"}
              </span>
              <span className="text-xs sm:text-sm truncate">
                {activeFlow === "voice_attendance"
                  ? "Class (Voice)"
                  : "Class Info"}
              </span>
            </div>
            <div className="w-0.5 h-4 sm:h-5 bg-blue-200 flex-shrink-0 hidden sm:block"></div>
            <div
              className={`flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${
                attendanceStep === "student_details"
                  ? "text-blue-600 font-semibold"
                  : "text-gray-600 font-normal"
              }`}
            >
              <span
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold flex-shrink-0 ${
                  attendanceStep === "student_details"
                    ? "bg-blue-600 text-white"
                    : "bg-blue-100 text-gray-600"
                }`}
              >
                {attendanceStep === "completed" ? "✓" : "2"}
              </span>
              <span className="text-xs sm:text-sm truncate">
                {activeFlow === "voice_attendance"
                  ? "Students (Voice)"
                  : "Students"}
              </span>
            </div>
            <div className="w-0.5 h-4 sm:h-5 bg-blue-200 flex-shrink-0 hidden sm:block"></div>
            <div
              className={`flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${
                attendanceStep === "completed"
                  ? "text-green-600 font-semibold"
                  : "text-gray-600 font-normal"
              }`}
            >
              <span
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold flex-shrink-0 ${
                  attendanceStep === "completed"
                    ? "bg-green-600 text-white"
                    : "bg-blue-100 text-gray-600"
                }`}
              >
                {attendanceStep === "completed" ? "✓" : "3"}
              </span>
              <span className="text-xs sm:text-sm truncate">Complete</span>
            </div>
          </div>
        </div>
      )}
      {/* Removed separate editable component - editing is now inline in the table */}

      <div className="chatbot-messages">
        {chatHistory.map((msg, idx) => (
          <div key={idx} className={`chatbot-msg-row ${msg.type}`}>
            {msg.type === "user" ? (
              <>
                <span className="chatbot-msg-bubble user">{msg.text}</span>
                {/* <span className="chatbot-msg-icon">
                  <FiUser />
                </span> */}
              </>
            ) : (
              <>
                {/* <span className="chatbot-msg-icon">
                  <FiCpu />
                </span> */}
                <div className="chatbot-msg-bubble bot relative">
                  {/* Processing indicator for image processing */}
                  {(msg as any).isProcessing && (
                    <div className="flex items-center gap-2 mb-2 p-2 rounded-md bg-gray-200 border border-gray-300">
                      <div className="w-5 h-5 rounded-full animate-spin border-2 border-gray-400 border-t-blue-600"></div>
                      <span className="text-sm text-gray-600">
                        Processing image...
                      </span>
                    </div>
                  )}
                  {/* Course progress flow is now fully backend-driven - no class selection UI needed */}
                  {/* The user simply says the class/section name via voice or text */}

                  {/* Show course progress data - Mobile-friendly UI */}
                  {msg.courseProgress && (msg as any).classSection && (
                    <div className="mt-3 bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-2xl shadow-lg overflow-hidden border border-indigo-100">
                      {/* Header Section */}
                      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                            <span className="text-xl sm:text-2xl">📊</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-base sm:text-lg font-bold text-white truncate">
                              {(msg as any).classSection.className} -{" "}
                              {(msg as any).classSection.sectionName}
                            </h4>
                            <p className="text-xs sm:text-sm text-indigo-100">
                              Course Progress Report
                            </p>
                          </div>
                        </div>

                        {/* Overall Progress Summary */}
                        {(() => {
                          const progressData = msg.courseProgress as any;
                          const teacherDiarys =
                            progressData.teacherDiarys || progressData || [];
                          if (
                            !Array.isArray(teacherDiarys) ||
                            teacherDiarys.length === 0
                          )
                            return null;

                          const totalProgress = teacherDiarys.reduce(
                            (sum: number, s: any) =>
                              sum +
                              (s.avrage_progress || s.average_progress || 0),
                            0,
                          );
                          const avgOverall = Math.round(
                            totalProgress / teacherDiarys.length,
                          );

                          return (
                            <div className="mt-4 bg-white/10 backdrop-blur rounded-xl p-3 sm:p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs sm:text-sm text-white/90 font-medium">
                                  Overall Progress
                                </span>
                                <span className="text-lg sm:text-xl font-bold text-white">
                                  {avgOverall}%
                                </span>
                              </div>
                              <div className="w-full h-2.5 sm:h-3 bg-white/20 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-green-400 to-emerald-400 rounded-full transition-all duration-700 ease-out"
                                  style={{
                                    width: `${Math.min(avgOverall, 100)}%`,
                                  }}
                                />
                              </div>
                              <div className="flex justify-between mt-2 text-xs text-white/70">
                                <span>{teacherDiarys.length} Subjects</span>
                                <span>
                                  {avgOverall >= 75
                                    ? "🎉 Great!"
                                    : avgOverall >= 50
                                      ? "👍 Good"
                                      : "📈 Keep Going"}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Subjects List */}
                      <div className="p-3 sm:p-4 max-h-[60vh] sm:max-h-[500px] overflow-y-auto">
                        {(() => {
                          const progressData = msg.courseProgress as any;
                          const teacherDiarys =
                            progressData.teacherDiarys || progressData || [];

                          if (
                            !Array.isArray(teacherDiarys) ||
                            teacherDiarys.length === 0
                          ) {
                            return (
                              <div className="text-center py-8">
                                <div className="w-16 h-16 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                                  <span className="text-2xl">📭</span>
                                </div>
                                <p className="text-gray-500 text-sm">
                                  No course progress data available
                                </p>
                              </div>
                            );
                          }

                          const getProgressStyle = (progress: number) => {
                            if (progress >= 75)
                              return {
                                bg: "bg-emerald-50",
                                bar: "bg-gradient-to-r from-emerald-400 to-green-500",
                                text: "text-emerald-700",
                                badge:
                                  "bg-emerald-100 text-emerald-700 border-emerald-200",
                              };
                            if (progress >= 50)
                              return {
                                bg: "bg-amber-50",
                                bar: "bg-gradient-to-r from-amber-400 to-yellow-500",
                                text: "text-amber-700",
                                badge:
                                  "bg-amber-100 text-amber-700 border-amber-200",
                              };
                            if (progress >= 25)
                              return {
                                bg: "bg-orange-50",
                                bar: "bg-gradient-to-r from-orange-400 to-red-400",
                                text: "text-orange-700",
                                badge:
                                  "bg-orange-100 text-orange-700 border-orange-200",
                              };
                            return {
                              bg: "bg-red-50",
                              bar: "bg-gradient-to-r from-red-400 to-rose-500",
                              text: "text-red-700",
                              badge: "bg-red-100 text-red-700 border-red-200",
                            };
                          };

                          return (
                            <div className="space-y-3">
                              {teacherDiarys.map(
                                (subject: any, subjectIdx: number) => {
                                  const subjectName =
                                    subject.name || "Unknown Subject";
                                  const avgProgress =
                                    subject.avrage_progress ||
                                    subject.average_progress ||
                                    0;
                                  const chapters = subject.chapters || [];
                                  const style = getProgressStyle(avgProgress);

                                  return (
                                    <details
                                      key={subject.id || subjectIdx}
                                      className={`group rounded-xl border ${style.bg} border-gray-200 overflow-hidden transition-all duration-200`}
                                    >
                                      <summary className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer list-none select-none hover:bg-white/50 transition-colors">
                                        {/* Subject Icon */}
                                        <div
                                          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${style.bg} border ${style.badge.split(" ")[2]} flex items-center justify-center flex-shrink-0`}
                                        >
                                          <span className="text-lg sm:text-xl">
                                            📚
                                          </span>
                                        </div>

                                        {/* Subject Info */}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between gap-2 mb-1.5">
                                            <h5 className="text-sm sm:text-base font-semibold text-gray-800 truncate">
                                              {subjectName}
                                            </h5>
                                            <span
                                              className={`flex-shrink-0 text-xs sm:text-sm font-bold px-2 py-0.5 rounded-full border ${style.badge}`}
                                            >
                                              {avgProgress}%
                                            </span>
                                          </div>

                                          {/* Progress Bar */}
                                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full ${style.bar} rounded-full transition-all duration-500`}
                                              style={{
                                                width: `${Math.min(avgProgress, 100)}%`,
                                              }}
                                            />
                                          </div>

                                          {/* Chapter Count */}
                                          <div className="flex items-center justify-between mt-1.5">
                                            <span className="text-xs text-gray-500">
                                              {chapters.length} chapter
                                              {chapters.length !== 1 ? "s" : ""}
                                            </span>
                                            <span className="text-xs text-indigo-500 group-open:rotate-180 transition-transform duration-200">
                                              ▼ Details
                                            </span>
                                          </div>
                                        </div>
                                      </summary>

                                      {/* Chapters (Expandable) */}
                                      {chapters.length > 0 && (
                                        <div className="px-3 pb-3 sm:px-4 sm:pb-4 pt-1 space-y-2 border-t border-gray-100 bg-white/30">
                                          {chapters.map(
                                            (
                                              chapter: any,
                                              chapterIdx: number,
                                            ) => {
                                              const chapterName =
                                                chapter.name ||
                                                "Unknown Chapter";
                                              const chapterProgress =
                                                chapter.coverage_status || 0;
                                              const chStyle =
                                                getProgressStyle(
                                                  chapterProgress,
                                                );

                                              return (
                                                <div
                                                  key={chapter.id || chapterIdx}
                                                  className="bg-white rounded-lg p-2.5 sm:p-3 border border-gray-100 shadow-sm"
                                                >
                                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                                    <span className="text-xs sm:text-sm text-gray-700 font-medium truncate flex-1">
                                                      {chapterName}
                                                    </span>
                                                    <span
                                                      className={`flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded ${chStyle.badge}`}
                                                    >
                                                      {chapterProgress}%
                                                    </span>
                                                  </div>
                                                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                      className={`h-full ${chStyle.bar} rounded-full transition-all duration-500`}
                                                      style={{
                                                        width: `${Math.min(chapterProgress, 100)}%`,
                                                      }}
                                                    />
                                                  </div>
                                                </div>
                                              );
                                            },
                                          )}
                                        </div>
                                      )}

                                      {chapters.length === 0 && (
                                        <div className="px-4 pb-3 pt-1 border-t border-gray-100">
                                          <p className="text-xs text-gray-400 italic text-center py-2">
                                            No chapters available
                                          </p>
                                        </div>
                                      )}
                                    </details>
                                  );
                                },
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Footer Legend */}
                      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-emerald-400 to-green-500"></div>
                            <span className="text-gray-600">75%+</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500"></div>
                            <span className="text-gray-600">50-74%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-orange-400 to-red-400"></div>
                            <span className="text-gray-600">25-49%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-red-400 to-rose-500"></div>
                            <span className="text-gray-600">&lt;25%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Class sections selection UI - Voice/Text friendly */}
                  {(msg as any).classSectionsOptions &&
                    Array.isArray((msg as any).classSectionsOptions) &&
                    (msg as any).classSectionsOptions.length > 0 && (
                      <div className="mt-3 bg-gradient-to-br from-blue-50 via-white to-indigo-50 rounded-2xl shadow-lg overflow-hidden border border-blue-100">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 sm:px-5 sm:py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                              <span className="text-xl">📚</span>
                            </div>
                            <div>
                              <h4 className="text-base sm:text-lg font-bold text-white">
                                Select Your Class
                              </h4>
                              <p className="text-xs sm:text-sm text-blue-100">
                                {(msg as any).classSectionsOptions.length} class
                                section
                                {(msg as any).classSectionsOptions.length !== 1
                                  ? "s"
                                  : ""}{" "}
                                available
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Class Sections Grid */}
                        <div className="p-3 sm:p-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                            {(msg as any).classSectionsOptions.map(
                              (cs: any, csIdx: number) => {
                                const className = cs.class?.name || "Unknown";
                                const sectionName =
                                  cs.section?.name || "Unknown";
                                const isClassTeacher =
                                  cs.isClassTeacher === true;

                                return (
                                  <div
                                    key={
                                      cs.class?._id + cs.section?._id || csIdx
                                    }
                                    className={`relative p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 ${
                                      isClassTeacher
                                        ? "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200"
                                        : "bg-white border-gray-200 hover:border-blue-300"
                                    }`}
                                  >
                                    {/* Class Teacher Badge */}
                                    {isClassTeacher && (
                                      <div className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-400 to-yellow-500 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                                        Class Teacher
                                      </div>
                                    )}

                                    <div className="flex items-center gap-3">
                                      {/* Number Badge */}
                                      <div
                                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-bold text-lg sm:text-xl ${
                                          isClassTeacher
                                            ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-white"
                                            : "bg-gradient-to-br from-blue-500 to-indigo-500 text-white"
                                        }`}
                                      >
                                        {csIdx + 1}
                                      </div>

                                      {/* Class Info */}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-base sm:text-lg font-bold text-gray-800">
                                          {className}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                          Section {sectionName}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>

                          {/* Hint */}
                          <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                            <div className="flex items-start gap-2">
                              <span className="text-blue-500 text-lg">💡</span>
                              <div className="text-sm text-blue-700">
                                <span className="font-semibold">
                                  How to select:
                                </span>
                                <ul className="mt-1 space-y-0.5 text-blue-600">
                                  <li>
                                    • Say the class name: "
                                    <span className="font-medium">
                                      {(msg as any).classSectionsOptions[0]
                                        ?.class?.name || "III"}{" "}
                                      {(msg as any).classSectionsOptions[0]
                                        ?.section?.name || "A"}
                                    </span>
                                    "
                                  </li>
                                  <li>
                                    • Or say: "
                                    <span className="font-medium">
                                      first one
                                    </span>
                                    ", "
                                    <span className="font-medium">second</span>
                                    ", etc.
                                  </li>
                                  <li>
                                    • Or type: "
                                    <span className="font-medium">
                                      Class 3 A
                                    </span>
                                    " or "
                                    <span className="font-medium">3 A</span>"
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Only show text if no special UI components are displayed */}
                  {msg.text &&
                    !(msg as any).classSectionsOptions &&
                    !(msg.courseProgress && (msg as any).classSection) && (
                      <div className="text-gray-800 leading-relaxed">
                        {msg.text}
                      </div>
                    )}

                  {!msg.text && (
                    <>
                      {/* Only show answer, no tabs */}
                      {(() => {
                        // Always show answer content
                        return (
                          <>
                            {/* Show leave approval requests if in leave_approval flow */}
                            {activeFlow === "leave_approval" &&
                              idx === leaveApprovalDashboardIdx && (
                                <>
                                  {loadingLeaveRequests ? (
                                    <div className="mt-4 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl shadow-sm">
                                      <div className="flex items-center justify-center gap-4">
                                        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-blue-900 font-semibold text-base">
                                          Loading pending leave requests...
                                        </span>
                                      </div>
                                    </div>
                                  ) : leaveApprovalRequests.length > 0 ? (
                                    <div className="mt-4 space-y-5">
                                      {/* Summary Header */}
                                      <div className="p-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-lg text-white">
                                        <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl">
                                            📋
                                          </div>
                                          <div>
                                            <h3 className="text-lg font-bold">
                                              Leave Approval Dashboard
                                            </h3>
                                            <p className="text-sm text-blue-100">
                                              {leaveApprovalRequests.length}{" "}
                                              {leaveApprovalRequests.length ===
                                              1
                                                ? "request"
                                                : "requests"}{" "}
                                              pending review
                                            </p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Leave Request Cards */}
                                      {leaveApprovalRequests.map(
                                        (request, reqIdx) => {
                                          const startDate = new Date(
                                            request.start_date,
                                          );
                                          const endDate = new Date(
                                            request.end_date,
                                          );
                                          const startDateStr =
                                            startDate.toLocaleDateString(
                                              "en-US",
                                              {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                              },
                                            );
                                          const endDateStr =
                                            endDate.toLocaleDateString(
                                              "en-US",
                                              {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                              },
                                            );
                                          const isSingleDay =
                                            startDateStr === endDateStr;
                                          const daysDiff =
                                            Math.ceil(
                                              (endDate.getTime() -
                                                startDate.getTime()) /
                                                (1000 * 60 * 60 * 24),
                                            ) + 1;

                                          const employeeName =
                                            request.employee?.personalInfo
                                              ?.employeeName || "Unknown";
                                          const employeeId =
                                            request.employee?.personalInfo
                                              ?.employeeId || "";
                                          const leaveType =
                                            request.leave_type?.name ||
                                            "Unknown";
                                          const description =
                                            request.description ||
                                            "No description provided";
                                          const photoPath =
                                            request.employee?.personalInfo
                                              ?.photoDocument?.path;

                                          return (
                                            <div
                                              key={request.uuid || reqIdx}
                                              className="bg-white border-2 border-gray-200 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
                                            >
                                              {/* Card Header */}
                                              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                                                <div className="flex items-center gap-4">
                                                  {photoPath ? (
                                                    <img
                                                      src={photoPath}
                                                      alt={employeeName}
                                                      className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
                                                      onError={(e) => {
                                                        (
                                                          e.target as HTMLImageElement
                                                        ).style.display =
                                                          "none";
                                                      }}
                                                    />
                                                  ) : (
                                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-2xl font-bold shadow-md">
                                                      {employeeName
                                                        .charAt(0)
                                                        .toUpperCase()}
                                                    </div>
                                                  )}
                                                  <div className="flex-1">
                                                    <h4 className="text-xl font-bold text-gray-900 mb-1">
                                                      {employeeName}
                                                    </h4>
                                                    <p className="text-sm text-gray-600 flex items-center gap-2">
                                                      <span className="font-medium">
                                                        Employee ID:
                                                      </span>
                                                      <span className="bg-gray-200 px-2 py-0.5 rounded-md font-mono text-xs">
                                                        {employeeId || "N/A"}
                                                      </span>
                                                    </p>
                                                  </div>
                                                </div>
                                              </div>

                                              {/* Card Body */}
                                              <div className="p-6">
                                                {/* Leave Details Grid */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                                                  {/* Leave Type */}
                                                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                                    <div className="flex items-center gap-2 mb-2">
                                                      <span className="text-blue-600 text-lg">
                                                        📝
                                                      </span>
                                                      <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                                                        Leave Type
                                                      </span>
                                                    </div>
                                                    <p className="text-base font-semibold text-gray-900">
                                                      {leaveType}
                                                    </p>
                                                  </div>

                                                  {/* Duration */}
                                                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                                                    <div className="flex items-center gap-2 mb-2">
                                                      <span className="text-purple-600 text-lg">
                                                        📅
                                                      </span>
                                                      <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                                                        Duration
                                                      </span>
                                                    </div>
                                                    <p className="text-base font-semibold text-gray-900">
                                                      {isSingleDay
                                                        ? startDateStr
                                                        : `${startDateStr} - ${endDateStr}`}
                                                    </p>
                                                    <p className="text-xs text-gray-600 mt-1">
                                                      {daysDiff}{" "}
                                                      {daysDiff === 1
                                                        ? "day"
                                                        : "days"}
                                                    </p>
                                                  </div>
                                                </div>

                                                {/* Reason Section */}
                                                <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 mb-5">
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-amber-600 text-lg">
                                                      💬
                                                    </span>
                                                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                                                      Reason
                                                    </span>
                                                  </div>
                                                  <p className="text-sm text-gray-800 leading-relaxed">
                                                    {description}
                                                  </p>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t-2 border-gray-200">
                                                  {/* Approve Button */}
                                                  <button
                                                    onClick={async () => {
                                                      try {
                                                        const authToken =
                                                          localStorage.getItem(
                                                            "token",
                                                          );
                                                        const {
                                                          academic_session,
                                                          branch_token,
                                                        } = getErpContext();
                                                        await leaveApprovalAPI.approve(
                                                          {
                                                            leave_request_uuid:
                                                              request.uuid,
                                                            bearer_token:
                                                              authToken ||
                                                              undefined,
                                                            academic_session,
                                                            branch_token,
                                                          },
                                                        );
                                                        setLeaveApprovalRequests(
                                                          (prev: any[]) =>
                                                            prev.filter(
                                                              (r: any) =>
                                                                r.uuid !==
                                                                request.uuid,
                                                            ),
                                                        );
                                                        setChatHistory(
                                                          (prev) => [
                                                            ...prev,
                                                            {
                                                              type: "bot",
                                                              text: `✅ Leave request for **${employeeName}** has been approved successfully!`,
                                                            },
                                                          ],
                                                        );
                                                        speakLeaveActionResult(
                                                          `Leave request for ${employeeName} has been approved successfully!`,
                                                        );
                                                      } catch (err: any) {
                                                        setChatHistory(
                                                          (prev) => [
                                                            ...prev,
                                                            {
                                                              type: "bot",
                                                              text: `❌ Error approving leave request: ${
                                                                err.message ||
                                                                "Unknown error"
                                                              }`,
                                                            },
                                                          ],
                                                        );
                                                      }
                                                    }}
                                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                                                  >
                                                    <span className="text-xl">
                                                      ✓
                                                    </span>
                                                    <span>Approve</span>
                                                  </button>

                                                  {/* Reject Section */}
                                                  <div className="flex-1 flex flex-col sm:flex-row gap-2">
                                                    <input
                                                      type="text"
                                                      placeholder="Rejection reason (optional)"
                                                      value={
                                                        rejectReason[
                                                          request.uuid
                                                        ] || ""
                                                      }
                                                      onChange={(e) =>
                                                        setRejectReason(
                                                          (prev: {
                                                            [
                                                              key: string
                                                            ]: string;
                                                          }) => ({
                                                            ...prev,
                                                            [request.uuid]:
                                                              e.target.value,
                                                          }),
                                                        )
                                                      }
                                                      className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200 transition-all"
                                                    />
                                                    <button
                                                      onClick={async () => {
                                                        try {
                                                          const authToken =
                                                            localStorage.getItem(
                                                              "token",
                                                            );
                                                          const reason =
                                                            rejectReason[
                                                              request.uuid
                                                            ] ||
                                                            "No reason provided";
                                                          const {
                                                            academic_session,
                                                            branch_token,
                                                          } = getErpContext();
                                                          await leaveApprovalAPI.reject(
                                                            {
                                                              leave_request_uuid:
                                                                request.uuid,
                                                              reject_reason:
                                                                reason,
                                                              bearer_token:
                                                                authToken ||
                                                                undefined,
                                                              academic_session,
                                                              branch_token,
                                                            },
                                                          );
                                                          setLeaveApprovalRequests(
                                                            (prev: any[]) =>
                                                              prev.filter(
                                                                (r: any) =>
                                                                  r.uuid !==
                                                                  request.uuid,
                                                              ),
                                                          );
                                                          setRejectReason(
                                                            (prev: {
                                                              [
                                                                key: string
                                                              ]: string;
                                                            }) => {
                                                              const newReasons =
                                                                {
                                                                  ...prev,
                                                                };
                                                              delete newReasons[
                                                                request.uuid
                                                              ];
                                                              return newReasons;
                                                            },
                                                          );
                                                          setChatHistory(
                                                            (prev) => [
                                                              ...prev,
                                                              {
                                                                type: "bot",
                                                                text: `❌ Leave request for **${employeeName}** has been rejected. Reason: ${reason}`,
                                                              },
                                                            ],
                                                          );
                                                          speakLeaveActionResult(
                                                            `Leave request for ${employeeName} has been rejected. Reason: ${reason}`,
                                                          );
                                                        } catch (err: any) {
                                                          setChatHistory(
                                                            (prev) => [
                                                              ...prev,
                                                              {
                                                                type: "bot",
                                                                text: `❌ Error rejecting leave request: ${
                                                                  err.message ||
                                                                  "Unknown error"
                                                                }`,
                                                              },
                                                            ],
                                                          );
                                                        }
                                                      }}
                                                      className="px-6 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg font-semibold hover:from-red-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2 whitespace-nowrap"
                                                    >
                                                      <span className="text-xl">
                                                        ✗
                                                      </span>
                                                      <span>Reject</span>
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        },
                                      )}
                                    </div>
                                  ) : (
                                    <div className="mt-4 p-8 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl text-center shadow-lg">
                                      <div className="text-6xl mb-4 animate-bounce">
                                        ✅
                                      </div>
                                      <h3 className="text-green-900 font-bold text-xl mb-2">
                                        All Clear! 🎉
                                      </h3>
                                      <p className="text-green-700 font-medium text-base">
                                        No pending leave requests found
                                      </p>
                                      <p className="text-green-600 text-sm mt-2">
                                        All leave requests have been processed
                                        or there are no pending requests at this
                                        time.
                                      </p>
                                    </div>
                                  )}
                                </>
                              )}
                            {/* Show student leave approval requests if in student_leave_approval flow */}
                            {activeFlow === "student_leave_approval" &&
                              idx === studentLeaveApprovalDashboardIdx && (
                                <>
                                  {loadingStudentLeaveRequests ? (
                                    <div className="mt-4 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl shadow-sm">
                                      <div className="flex items-center justify-center gap-4">
                                        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-blue-900 font-semibold text-base">
                                          Loading pending student leave
                                          requests...
                                        </span>
                                      </div>
                                    </div>
                                  ) : studentLeaveApprovalRequests.length >
                                    0 ? (
                                    <div className="mt-4 space-y-5">
                                      {/* Summary Header */}
                                      <div className="p-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-lg text-white">
                                        <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl">
                                            📋
                                          </div>
                                          <div>
                                            <h3 className="text-lg font-bold">
                                              Student Leave Approval Dashboard
                                            </h3>
                                            <p className="text-sm text-blue-100">
                                              {
                                                studentLeaveApprovalRequests.length
                                              }{" "}
                                              {studentLeaveApprovalRequests.length ===
                                              1
                                                ? "request"
                                                : "requests"}{" "}
                                              pending review
                                            </p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Student Leave Request Cards */}
                                      {studentLeaveApprovalRequests.map(
                                        (request, reqIdx) => {
                                          const startDate = new Date(
                                            request.from_date,
                                          );
                                          const endDate = new Date(
                                            request.to_date,
                                          );
                                          const startDateStr =
                                            startDate.toLocaleDateString(
                                              "en-US",
                                              {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                              },
                                            );
                                          const endDateStr =
                                            endDate.toLocaleDateString(
                                              "en-US",
                                              {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                              },
                                            );
                                          const isSingleDay =
                                            startDateStr === endDateStr;
                                          const daysDiff =
                                            Math.ceil(
                                              (endDate.getTime() -
                                                startDate.getTime()) /
                                                (1000 * 60 * 60 * 24),
                                            ) + 1;

                                          const studentName =
                                            request.student?.fullName?.trim() ||
                                            request.student?.personalInfo?.firstName?.trim() ||
                                            "Unknown";
                                          const studentId =
                                            request.student?.admissionNumber ||
                                            request.student?.personalInfo
                                              ?.admissionNo ||
                                            "";
                                          const classSection = `${
                                            request.student?.class?.name ||
                                            "N/A"
                                          } - ${
                                            request.student?.section?.name ||
                                            "N/A"
                                          }`;
                                          const leaveType =
                                            formatStudentLeaveType(
                                              request.leave_type,
                                            );
                                          const description =
                                            request.description ||
                                            "No description provided";
                                          const photoPath =
                                            request.student?.personalInfo
                                              ?.studentPhotoDocument?.path;

                                          return (
                                            <div
                                              key={request.uuid || reqIdx}
                                              className="bg-white border-2 border-gray-200 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
                                            >
                                              {/* Card Header */}
                                              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                                                <div className="flex items-center gap-4">
                                                  {photoPath ? (
                                                    <img
                                                      src={photoPath}
                                                      alt={studentName}
                                                      className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
                                                      onError={(e) => {
                                                        (
                                                          e.target as HTMLImageElement
                                                        ).style.display =
                                                          "none";
                                                      }}
                                                    />
                                                  ) : (
                                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-2xl font-bold shadow-md">
                                                      {studentName
                                                        .charAt(0)
                                                        .toUpperCase()}
                                                    </div>
                                                  )}
                                                  <div className="flex-1">
                                                    <h4 className="text-xl font-bold text-gray-900 mb-1">
                                                      {studentName}
                                                    </h4>
                                                    <p className="text-sm text-gray-600 flex items-center gap-2">
                                                      <span className="font-medium">
                                                        Student ID:
                                                      </span>
                                                      <span className="bg-gray-200 px-2 py-0.5 rounded-md font-mono text-xs">
                                                        {studentId || "N/A"}
                                                      </span>
                                                    </p>
                                                  </div>
                                                </div>
                                              </div>

                                              {/* Card Body */}
                                              <div className="p-6">
                                                {/* Leave Details Grid */}
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                                                  {/* Leave Type */}
                                                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                                    <div className="flex items-center gap-2 mb-2">
                                                      <span className="text-blue-600 text-lg">
                                                        📝
                                                      </span>
                                                      <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                                                        Leave Type
                                                      </span>
                                                    </div>
                                                    <p className="text-base font-semibold text-gray-900">
                                                      {leaveType}
                                                    </p>
                                                  </div>

                                                  {/* Duration */}
                                                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                                                    <div className="flex items-center gap-2 mb-2">
                                                      <span className="text-purple-600 text-lg">
                                                        📅
                                                      </span>
                                                      <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                                                        Duration
                                                      </span>
                                                    </div>
                                                    <p className="text-base font-semibold text-gray-900">
                                                      {isSingleDay
                                                        ? startDateStr
                                                        : `${startDateStr} - ${endDateStr}`}
                                                    </p>
                                                    <p className="text-xs text-gray-600 mt-1">
                                                      {daysDiff}{" "}
                                                      {daysDiff === 1
                                                        ? "day"
                                                        : "days"}
                                                    </p>
                                                  </div>

                                                  {/* Class-Section */}
                                                  <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
                                                    <div className="flex items-center gap-2 mb-2">
                                                      <span className="text-teal-600 text-lg">
                                                        🏫
                                                      </span>
                                                      <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                                                        Class-Section
                                                      </span>
                                                    </div>
                                                    <p className="text-base font-semibold text-gray-900">
                                                      {classSection}
                                                    </p>
                                                  </div>
                                                </div>

                                                {/* Reason Section */}
                                                <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 mb-5">
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-amber-600 text-lg">
                                                      💬
                                                    </span>
                                                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                                                      Reason
                                                    </span>
                                                  </div>
                                                  <p className="text-sm text-gray-800 leading-relaxed">
                                                    {description}
                                                  </p>
                                                </div>

                                                {/* Attachments Section */}
                                                {request.attachments &&
                                                  request.attachments.length >
                                                    0 && (
                                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mb-5">
                                                      <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-gray-600 text-lg">
                                                          📎
                                                        </span>
                                                        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                                          Attachments
                                                        </span>
                                                      </div>
                                                      <div className="flex flex-col gap-1">
                                                        {request.attachments.map(
                                                          (
                                                            att: any,
                                                            i: number,
                                                          ) => (
                                                            <a
                                                              key={
                                                                att.uuid || i
                                                              }
                                                              href={att.path}
                                                              onClick={(e) => {
                                                                e.preventDefault();
                                                                onOpenPreview(
                                                                  att.path,
                                                                  att.originalname ||
                                                                    att.name ||
                                                                    `Attachment ${i + 1}`,
                                                                );
                                                              }}
                                                              className="text-sm text-blue-600 hover:underline cursor-pointer"
                                                            >
                                                              {att.originalname ||
                                                                att.name ||
                                                                `Attachment ${i + 1}`}
                                                            </a>
                                                          ),
                                                        )}
                                                      </div>
                                                    </div>
                                                  )}

                                                {/* Action Buttons */}
                                                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t-2 border-gray-200">
                                                  {/* Approve Button */}
                                                  <button
                                                    onClick={async () => {
                                                      try {
                                                        const authToken =
                                                          localStorage.getItem(
                                                            "token",
                                                          );
                                                        const {
                                                          academic_session,
                                                          branch_token,
                                                        } = getErpContext();
                                                        await studentLeaveApprovalAPI.approve(
                                                          {
                                                            leave_request_uuid:
                                                              request.uuid,
                                                            bearer_token:
                                                              authToken ||
                                                              undefined,
                                                            academic_session,
                                                            branch_token,
                                                          },
                                                        );
                                                        setStudentLeaveApprovalRequests(
                                                          (prev: any[]) =>
                                                            prev.filter(
                                                              (r: any) =>
                                                                r.uuid !==
                                                                request.uuid,
                                                            ),
                                                        );
                                                        setChatHistory(
                                                          (prev) => [
                                                            ...prev,
                                                            {
                                                              type: "bot",
                                                              text: `✅ Student leave request for **${studentName}** has been approved successfully!`,
                                                            },
                                                          ],
                                                        );
                                                        speakLeaveActionResult(
                                                          `Student leave request for ${studentName} has been approved successfully!`,
                                                        );
                                                      } catch (err: any) {
                                                        setChatHistory(
                                                          (prev) => [
                                                            ...prev,
                                                            {
                                                              type: "bot",
                                                              text: `❌ Error approving student leave request: ${
                                                                err.message ||
                                                                "Unknown error"
                                                              }`,
                                                            },
                                                          ],
                                                        );
                                                      }
                                                    }}
                                                    className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                                                  >
                                                    <span className="text-xl">
                                                      ✓
                                                    </span>
                                                    <span>Approve</span>
                                                  </button>

                                                  {/* Reject Section */}
                                                  <div className="flex-1 flex flex-col sm:flex-row gap-2">
                                                    <input
                                                      type="text"
                                                      placeholder="Rejection reason (optional)"
                                                      value={
                                                        studentRejectReason[
                                                          request.uuid
                                                        ] || ""
                                                      }
                                                      onChange={(e) =>
                                                        setStudentRejectReason(
                                                          (prev: {
                                                            [
                                                              key: string
                                                            ]: string;
                                                          }) => ({
                                                            ...prev,
                                                            [request.uuid]:
                                                              e.target.value,
                                                          }),
                                                        )
                                                      }
                                                      className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200 transition-all"
                                                    />
                                                    <button
                                                      onClick={async () => {
                                                        try {
                                                          const authToken =
                                                            localStorage.getItem(
                                                              "token",
                                                            );
                                                          const reason =
                                                            studentRejectReason[
                                                              request.uuid
                                                            ] ||
                                                            "No reason provided";
                                                          const {
                                                            academic_session,
                                                            branch_token,
                                                          } = getErpContext();
                                                          await studentLeaveApprovalAPI.reject(
                                                            {
                                                              leave_request_uuid:
                                                                request.uuid,
                                                              reject_reason:
                                                                reason,
                                                              bearer_token:
                                                                authToken ||
                                                                undefined,
                                                              academic_session,
                                                              branch_token,
                                                            },
                                                          );
                                                          setStudentLeaveApprovalRequests(
                                                            (prev: any[]) =>
                                                              prev.filter(
                                                                (r: any) =>
                                                                  r.uuid !==
                                                                  request.uuid,
                                                              ),
                                                          );
                                                          setStudentRejectReason(
                                                            (prev: {
                                                              [
                                                                key: string
                                                              ]: string;
                                                            }) => {
                                                              const newReasons =
                                                                {
                                                                  ...prev,
                                                                };
                                                              delete newReasons[
                                                                request.uuid
                                                              ];
                                                              return newReasons;
                                                            },
                                                          );
                                                          setChatHistory(
                                                            (prev) => [
                                                              ...prev,
                                                              {
                                                                type: "bot",
                                                                text: `❌ Student leave request for **${studentName}** has been rejected. Reason: ${reason}`,
                                                              },
                                                            ],
                                                          );
                                                          speakLeaveActionResult(
                                                            `Student leave request for ${studentName} has been rejected. Reason: ${reason}`,
                                                          );
                                                        } catch (err: any) {
                                                          setChatHistory(
                                                            (prev) => [
                                                              ...prev,
                                                              {
                                                                type: "bot",
                                                                text: `❌ Error rejecting student leave request: ${
                                                                  err.message ||
                                                                  "Unknown error"
                                                                }`,
                                                              },
                                                            ],
                                                          );
                                                        }
                                                      }}
                                                      className="px-6 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg font-semibold hover:from-red-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2 whitespace-nowrap"
                                                    >
                                                      <span className="text-xl">
                                                        ✗
                                                      </span>
                                                      <span>Reject</span>
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        },
                                      )}
                                    </div>
                                  ) : (
                                    <div className="mt-4 p-8 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl text-center shadow-lg">
                                      <div className="text-6xl mb-4 animate-bounce">
                                        ✅
                                      </div>
                                      <h3 className="text-green-900 font-bold text-xl mb-2">
                                        All Clear! 🎉
                                      </h3>
                                      <p className="text-green-700 font-medium text-base">
                                        No pending student leave requests
                                        found
                                      </p>
                                      <p className="text-green-600 text-sm mt-2">
                                        All student leave requests have been
                                        processed or there are no pending
                                        requests at this time.
                                      </p>
                                    </div>
                                  )}
                                </>
                              )}
                            {/* Show table if this message has attendance data */}
                            {(() => {
                              return (
                                msg.attendance_summary &&
                                msg.attendance_summary.length > 0
                              );
                            })() ? (
                              (() => {
                                return true;
                              })() && (
                                <div
                                  id={`attendance-summary-${idx}`}
                                  className="attendance-summary-card bg-white border border-gray-200 rounded-lg p-3 sm:p-4 my-3 sm:my-4 shadow-sm"
                                >
                                  {/* Header */}
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3 sm:mb-4 pb-2 border-b border-gray-300">
                                    <div className="min-w-0">
                                      <h3 className="text-gray-900 m-0 mb-1 text-base sm:text-lg font-semibold truncate">
                                        {editingMessageIndex !== null
                                          ? "✏️ Edit Attendance Summary"
                                          : "📋 Attendance Summary"}
                                      </h3>
                                      {editingMessageIndex !== null && (
                                        <div className="bg-blue-100 text-blue-900 p-2 rounded-md text-xs sm:text-sm mb-3 sm:mb-4 font-medium">
                                          ✏️ Edit mode active - Modify
                                          names/status below
                                        </div>
                                      )}
                                      {/* Edit Mode Buttons - Show Save/Cancel when in edit mode */}
                                      {editingMessageIndex !== null && (
                                        <div className="flex flex-wrap gap-2 mb-3 sm:mb-4 p-2 rounded-md bg-gray-50 border border-gray-200">
                                          <button
                                            onClick={() =>
                                              handleSaveAttendance(idx)
                                            }
                                            className="px-3 py-2 sm:px-4 sm:py-2 rounded-md border-none bg-green-500 text-white cursor-pointer text-xs sm:text-sm font-medium transition-colors hover:bg-green-600 min-h-[44px] touch-manipulation"
                                          >
                                            💾 Save
                                          </button>
                                          <button
                                            onClick={() => {
                                              // Cancel editing - exit edit mode without saving
                                              setEditingMessageIndex(null);
                                              setChatHistory((prev) => {
                                                const updatedHistory = [
                                                  ...prev,
                                                ];
                                                if (
                                                  updatedHistory[idx] &&
                                                  updatedHistory[idx].type ===
                                                    "bot"
                                                ) {
                                                  (
                                                    updatedHistory[idx] as any
                                                  ).isBeingEdited = false;
                                                }
                                                return updatedHistory;
                                              });
                                              setChatHistory((prev) => [
                                                ...prev,
                                                {
                                                  type: "bot",
                                                  text: "❌ Edit cancelled. No changes were saved.",
                                                },
                                              ]);
                                            }}
                                            className="px-3 py-2 sm:px-4 sm:py-2 rounded-md border-none bg-red-500 text-white cursor-pointer text-xs sm:text-sm font-medium transition-colors hover:bg-red-600 min-h-[44px] touch-manipulation"
                                          >
                                            ❌ Cancel
                                          </button>
                                        </div>
                                      )}
                                      {classInfo && (
                                        <p className="text-gray-500 m-0 text-xs sm:text-sm truncate">
                                          Class {classInfo.class_}{" "}
                                          {classInfo.section} • {classInfo.date}
                                        </p>
                                      )}
                                    </div>

                                    {/* Inline editing buttons removed - using main approval buttons instead */}
                                  </div>

                                  {/* Statistics - Mobile: wrap, smaller text */}
                                  <div className="flex flex-wrap gap-2 sm:gap-4 mb-3 sm:mb-4 p-2 sm:p-3 rounded-md bg-gray-50 text-xs sm:text-sm">
                                    {(() => {
                                      const isEditing =
                                        editingMessageIndex !== null;
                                      const dataToUse = isEditing
                                        ? attendanceData
                                        : msg.attendance_summary || [];
                                      return (
                                        <>
                                          <div className="text-gray-900">
                                            <strong>Total:</strong>{" "}
                                            {dataToUse.length}
                                          </div>
                                          <div className="text-green-500">
                                            <strong>Present:</strong>{" "}
                                            {
                                              dataToUse.filter(
                                                (item: AttendanceRecord) =>
                                                  item.attendance_status ===
                                                  "Present",
                                              ).length
                                            }
                                          </div>
                                          <div className="text-red-500">
                                            <strong>Absent:</strong>{" "}
                                            {
                                              dataToUse.filter(
                                                (item: AttendanceRecord) =>
                                                  item.attendance_status ===
                                                  "Absent",
                                              ).length
                                            }
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>

                                  {/* Editable Table - Horizontal scroll on mobile */}
                                  <div className="overflow-x-auto -mx-1 sm:mx-0 border border-gray-200 rounded-md touch-pan-x">
                                    <table className="w-full border-collapse text-xs sm:text-sm min-w-[280px]">
                                      <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                          <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-gray-900 font-semibold border-r border-gray-200 whitespace-nowrap">
                                            Student Name
                                          </th>
                                          <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-gray-900 font-semibold border-r border-gray-200 whitespace-nowrap">
                                            Status
                                          </th>
                                          <th className="px-2 sm:px-3 py-2 sm:py-3 text-center text-gray-900 font-semibold w-[70px] sm:w-[100px] whitespace-nowrap">
                                            Actions
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(() => {
                                          const isEditing =
                                            editingMessageIndex !== null;
                                          const dataToUse = isEditing
                                            ? attendanceData
                                            : msg.attendance_summary || [];
                                          console.log(
                                            `Table data for message ${idx}:`,
                                            {
                                              attendanceDataLength:
                                                attendanceData.length,
                                              msgAttendanceSummaryLength:
                                                msg.attendance_summary
                                                  ?.length || 0,
                                              dataToUseLength: dataToUse.length,
                                              isEditing: isEditing,
                                              msgAttendanceSummary:
                                                msg.attendance_summary,
                                              usingGlobalState: isEditing,
                                            },
                                          );

                                          // Show empty state if no data
                                          if (dataToUse.length === 0) {
                                            return (
                                              <tr>
                                                <td
                                                  colSpan={3}
                                                  className="p-8 text-center text-gray-500 italic"
                                                >
                                                  {isEditing
                                                    ? "No attendance data available for editing. Please check if the data was loaded properly."
                                                    : "No attendance data available. Please check if the class exists or try entering student information manually."}
                                                </td>
                                              </tr>
                                            );
                                          }

                                          return dataToUse.map(
                                            (
                                              item: AttendanceRecord,
                                              index: number,
                                            ) => (
                                              <tr
                                                key={index}
                                                className={`border-b border-gray-200 ${
                                                  index % 2 === 0
                                                    ? "bg-white"
                                                    : "bg-gray-50"
                                                }`}
                                              >
                                                <td className="px-2 sm:px-3 py-2 sm:py-3 border-r border-gray-200 text-gray-900">
                                                  {(() => {
                                                    const isEditing =
                                                      editingMessageIndex !==
                                                      null;
                                                    return isEditing ? (
                                                      <input
                                                        type="text"
                                                        value={
                                                          item.student_name
                                                        }
                                                        onChange={(e) =>
                                                          handleAttendanceDataChange(
                                                            index,
                                                            "student_name",
                                                            e.target.value,
                                                          )
                                                        }
                                                        className="w-full p-1.5 sm:p-2 border border-gray-300 rounded bg-white text-gray-900 text-xs sm:text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 min-w-0"
                                                      />
                                                    ) : (
                                                      <span className="text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none block">
                                                        {item.student_name}
                                                      </span>
                                                    );
                                                  })()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-2 sm:py-3 border-r border-gray-200 text-gray-900">
                                                  {(() => {
                                                    const isEditing =
                                                      editingMessageIndex !==
                                                      null;
                                                    return isEditing ? (
                                                      <select
                                                        value={
                                                          item.attendance_status
                                                        }
                                                        onChange={(e) =>
                                                          handleAttendanceDataChange(
                                                            index,
                                                            "attendance_status",
                                                            e.target.value,
                                                          )
                                                        }
                                                        className="w-full p-1.5 sm:p-2 border border-gray-300 rounded bg-white text-gray-900 text-xs sm:text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 min-w-0"
                                                      >
                                                        <option value="Present">
                                                          Present
                                                        </option>
                                                        <option value="Absent">
                                                          Absent
                                                        </option>
                                                      </select>
                                                    ) : (
                                                      <span
                                                        className={`text-xs sm:text-sm whitespace-nowrap ${
                                                          item.attendance_status ===
                                                          "Present"
                                                            ? "text-green-500"
                                                            : item.attendance_status ===
                                                                "Absent"
                                                              ? "text-red-500"
                                                              : "text-gray-500"
                                                        }`}
                                                      >
                                                        {item.attendance_status}
                                                      </span>
                                                    );
                                                  })()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-2 sm:py-3 text-center">
                                                  {editingMessageIndex !==
                                                    null && (
                                                    <button
                                                      onClick={() =>
                                                        handleRemoveStudent(
                                                          index,
                                                        )
                                                      }
                                                      className="px-1.5 py-1.5 sm:px-2 sm:py-2 min-w-[36px] min-h-[36px] border-none bg-red-500 text-white rounded cursor-pointer flex items-center justify-center text-xs hover:bg-red-600 active:scale-95 transition-colors touch-manipulation"
                                                      title="Remove Student"
                                                    >
                                                      🗑️
                                                    </button>
                                                  )}
                                                </td>
                                              </tr>
                                            ),
                                          );
                                        })()}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Add New Student - only show in edit mode */}
                                  {(editingMessageIndex === idx ||
                                    (msg as any).isBeingEdited) && (
                                    <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-slate-50 rounded-lg border border-gray-200">
                                      <button
                                        onClick={handleAddStudent}
                                        className="flex items-center justify-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 rounded-lg border-none bg-blue-600 text-white cursor-pointer text-sm font-medium transition-colors hover:bg-blue-700 active:scale-[0.98] min-h-[44px] touch-manipulation"
                                      >
                                        ➕ Add New Student
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            ) : (
                              <>
                                {/* Render answer as Markdown with GFM (tables) - Memoized to prevent refresh */}
                                <MemoizedAnswer
                                  answer={msg.answer || ""}
                                  messageIdx={idx}
                                  onOpenPreview={onOpenPreview}
                                />
                              </>
                            )}
                            {msg.visualization?.show_chart && msg.visualization ? (
                              <VisualizationRenderer
                                visualization={msg.visualization}
                              />
                            ) : null}
                            {msg.marks_table && (
                              <MarksEntryTable
                                data={msg.marks_table}
                                onSaveColumn={async (
                                  columnTitle,
                                  studentData,
                                ) => {
                                  if (!handleSaveColumn) return false;
                                  return handleSaveColumn(
                                    columnTitle,
                                    studentData,
                                    msg.session_id,
                                  );
                                }}
                              />
                            )}
                            {msg.health_card_sections &&
                              Array.isArray(msg.health_card_sections) &&
                              msg.health_card_sections.length > 0 &&
                              idx === lastHealthCardSectionsIdx && (
                                <HealthCardSelector
                                  sections={msg.health_card_sections}
                                  disabled={isProcessing}
                                  onConfirm={(selection) =>
                                    handleSubmit(selection)
                                  }
                                />
                              )}
                            {msg.health_card_table && (
                              <HealthCardTable
                                tableData={msg.health_card_table}
                                sessionId={msg.session_id || ""}
                                userId={userId}
                                userRoles={userRoles}
                                getErpContext={getErpContext}
                                appendBotMessage={(botMsg) =>
                                  setChatHistory((prev) => [...prev, botMsg])
                                }
                                speakBotMessage={speakHealthCardBotMessage}
                              />
                            )}
                            <div className="bot-actions-bottom">
                              <button
                                className="bot-action-btn"
                                title="Listen"
                                disabled={ttsLoading === idx}
                                onClick={() =>
                                  handlePlayTTS(idx, msg.answer || "")
                                }
                              >
                                <FiVolume2 />
                                {ttsLoading === idx && (
                                  <span className="feedback-sent-tooltip">
                                    Loading...
                                  </span>
                                )}
                              </button>
                              <button
                                className={getThumbsUpClass(msg)}
                                title="Approved"
                                disabled={msg.feedback === "Rejected"}
                                onClick={() =>
                                  handleSendFeedback(idx, "Approved")
                                }
                              >
                                <FiThumbsUp />
                                {msg.feedback === "Approved" && (
                                  <span className="feedback-sent-tooltip">
                                    Approved
                                  </span>
                                )}
                              </button>
                              <div style={{ position: "relative" }}>
                                <button
                                  className={getThumbsDownClass(msg)}
                                  title="Rejected"
                                  disabled={msg.feedback === "Approved"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowCorrectionBox(
                                      showCorrectionBox === idx ? null : idx,
                                    );
                                  }}
                                >
                                  <FiThumbsDown />
                                  {msg.feedback === "Rejected" && (
                                    <span className="feedback-sent-tooltip">
                                      Rejected
                                    </span>
                                  )}
                                </button>
                                {showCorrectionBox === idx &&
                                  msg.feedback !== "Approved" && (
                                    <div
                                      className="correction-box"
                                      ref={correctionBoxRef}
                                    >
                                      <div className="correction-title">
                                        Rejection Reason:
                                      </div>
                                      <input
                                        className="correction-input"
                                        type="text"
                                        placeholder="Enter reason..."
                                        value={feedbackComment[idx] || ""}
                                        onChange={(e) =>
                                          setFeedbackComment((prev) => ({
                                            ...prev,
                                            [idx]: e.target.value,
                                          }))
                                        }
                                      />
                                      <button
                                        className="correction-btn"
                                        onClick={() =>
                                          handleSendFeedback(
                                            idx,
                                            "Rejected",
                                            feedbackComment[idx] || "",
                                          )
                                        }
                                        disabled={!feedbackComment[idx]}
                                      >
                                        Submit
                                      </button>
                                    </div>
                                  )}
                              </div>
                            </div>
                            {msg.feedbackMessage && (
                              <div className="feedback-status-msg">
                                {msg.feedbackMessage}
                              </div>
                            )}

                            {(() => {
                              return (
                                (msg as any).buttons &&
                                (msg as any).buttons.length > 0
                              );
                            })() && (
                              <div className="bot-buttons">
                                {(msg as any).buttons.map(
                                  (btn: any, i: number) => (
                                    <button
                                      key={i}
                                      className="bot-text-btn"
                                      onClick={btn.action}
                                    >
                                      {btn.label}
                                    </button>
                                  ),
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {isProcessing && (
          <div className="chatbot-msg-row bot">
            {/* <span className="chatbot-msg-icon">
              <FiCpu />
            </span> */}
            <div className="chatbot-msg-bubble bot processing-bubble flex">
              <div className="processing-indicator flex gap-2 items-center justify-center">
                <motion.div
                  className="cloud-thinking-icon"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.7, 1, 0.7],
                    y: [0, -5, 0],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <SlBubbles />
                </motion.div>
                {/* <div className="animate-bounce">
                  <SlBubbles  />
                </div> */}
                <span className="thinking-text italic">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
