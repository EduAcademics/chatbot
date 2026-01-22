import React, { memo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  FiThumbsDown,
  FiThumbsUp,
  FiVolume2,
} from "react-icons/fi";
import { SlBubbles } from "react-icons/sl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, FlowType } from "./types";

type AttendanceStep = "class_info" | "student_details" | "completed";

export interface ChatConversationProps {
  chatHistory: ChatMessage[];
  isProcessing: boolean;
  activeFlow: FlowType;
  attendanceStep: AttendanceStep;

  // Course progress
  loadingClassSections: boolean;
  selectedClassSection: {
    classId: string;
    sectionId: string;
  } | null;
  onSelectClassSection: (selection: {
    classId: string;
    sectionId: string;
    className: string;
    sectionName: string;
  }) => void | Promise<void>;

  // Leave approval
  loadingLeaveRequests: boolean;
  leaveApprovalRequests: any[];
  rejectReason: { [key: string]: string };
  onRejectReasonChange: (uuid: string, value: string) => void;
  onApproveLeaveRequest: (request: any) => void | Promise<void>;
  onRejectLeaveRequest: (request: any) => void | Promise<void>;

  // Attendance edit table
  editingMessageIndex: number | null;
  attendanceData: any[];
  classInfo: any;
  onAttendanceDataChange: (index: number, field: string, value: string) => void;
  onAddStudent: () => void;
  onRemoveStudent: (index: number) => void;
  onSaveAttendance: (messageIndex: number) => void | Promise<void>;
  onCancelAttendanceEdit: (messageIndex: number) => void;

  // TTS + Feedback
  ttsLoading: number | null;
  onPlayTTS: (idx: number, text: string) => void | Promise<void>;
  getThumbsUpClass: (msg: ChatMessage) => string;
  getThumbsDownClass: (msg: ChatMessage) => string;
  onSendFeedback: (
    idx: number,
    type: "Approved" | "Rejected",
    comment?: string
  ) => void | Promise<void>;
  feedbackComment: { [idx: number]: string };
  onFeedbackCommentChange: (idx: number, value: string) => void;
  showCorrectionBox: number | null;
  onToggleCorrectionBox: (idx: number | null) => void;
}

// Memoized answer component to prevent refresh on re-renders
const MemoizedAnswer = memo(
  ({ answer, messageIdx }: { answer: string; messageIdx: number }) => {
    return (
      <div
        key={`answer-${messageIdx}-${answer.slice(0, 20)}`}
        className="markdown-content"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ node, ...props }) => (
              <div className="markdown-table-container">
                <table {...props} />
              </div>
            ),
          }}
        >
          {answer || ""}
        </ReactMarkdown>
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.answer === nextProps.answer &&
    prevProps.messageIdx === nextProps.messageIdx
);

export const ChatConversation: React.FC<ChatConversationProps> = ({
  chatHistory,
  isProcessing,
  activeFlow,
  attendanceStep,

  loadingClassSections,
  selectedClassSection,
  onSelectClassSection,

  loadingLeaveRequests,
  leaveApprovalRequests,
  rejectReason,
  onRejectReasonChange,
  onApproveLeaveRequest,
  onRejectLeaveRequest,

  editingMessageIndex,
  attendanceData,
  classInfo,
  onAttendanceDataChange,
  onAddStudent,
  onRemoveStudent,
  onSaveAttendance,
  onCancelAttendanceEdit,

  ttsLoading,
  onPlayTTS,
  getThumbsUpClass,
  getThumbsDownClass,
  onSendFeedback,
  feedbackComment,
  onFeedbackCommentChange,
  showCorrectionBox,
  onToggleCorrectionBox,
}) => {
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const correctionBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Close correction box when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      const isInsideCorrectionBox = target.closest(".correction-box");
      const isActionButton = target.closest(".bot-action-btn");

      if (
        showCorrectionBox !== null &&
        !isInsideCorrectionBox &&
        !isActionButton
      ) {
        onToggleCorrectionBox(null);
      }
    };

    if (showCorrectionBox !== null) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCorrectionBox, onToggleCorrectionBox]);

  return (
    <div className="chatbot-chatbox" ref={chatBoxRef}>
      {/* Attendance Flow Step Indicator */}
      {(activeFlow === "attendance" || activeFlow === "voice_attendance") && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center gap-4">
          <div
            className={`flex items-center gap-2 ${
              attendanceStep === "class_info"
                ? "text-blue-600 font-semibold"
                : "text-gray-600 font-normal"
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-semibold ${
                attendanceStep === "class_info"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-100 text-gray-600"
              }`}
            >
              {attendanceStep === "class_info" ? "1" : "✓"}
            </span>
            {activeFlow === "voice_attendance"
              ? "Class Info (Voice)"
              : "Class Information"}
          </div>
          <div className="w-0.5 h-5 bg-blue-200"></div>
          <div
            className={`flex items-center gap-2 ${
              attendanceStep === "student_details"
                ? "text-blue-600 font-semibold"
                : "text-gray-600 font-normal"
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-semibold ${
                attendanceStep === "student_details"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-100 text-gray-600"
              }`}
            >
              {attendanceStep === "completed" ? "✓" : "2"}
            </span>
            {activeFlow === "voice_attendance"
              ? "Student Details (Voice)"
              : "Student Details"}
          </div>
          <div className="w-0.5 h-5 bg-blue-200"></div>
          <div
            className={`flex items-center gap-2 ${
              attendanceStep === "completed"
                ? "text-green-600 font-semibold"
                : "text-gray-600 font-normal"
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-semibold ${
                attendanceStep === "completed"
                  ? "bg-green-600 text-white"
                  : "bg-blue-100 text-gray-600"
              }`}
            >
              {attendanceStep === "completed" ? "✓" : "3"}
            </span>
            Complete
          </div>
        </div>
      )}

      <div className="chatbot-messages">
        {chatHistory.map((msg, idx) => (
          <div key={idx} className={`chatbot-msg-row ${msg.type}`}>
            {msg.type === "user" ? (
              <span className="chatbot-msg-bubble user">{msg.text}</span>
            ) : (
              <div className="chatbot-msg-bubble bot relative">
                {(msg as any).isProcessing && (
                  <div className="flex items-center gap-2 mb-2 p-2 rounded-md bg-gray-200 border border-gray-300">
                    <div className="w-5 h-5 rounded-full animate-spin border-2 border-gray-400 border-t-blue-600"></div>
                    <span className="text-sm text-gray-600">
                      Processing image...
                    </span>
                  </div>
                )}

                {/* Course progress: class section selection */}
                {(msg as any).classSections &&
                  Array.isArray((msg as any).classSections) &&
                  (msg as any).classSections.length > 0 && (
                    <>
                      {loadingClassSections ? (
                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-blue-900 font-medium">
                              Loading class sections...
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm text-blue-900 font-medium">
                              📚 Select a class and section to view course
                              progress:
                            </p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {(msg as any).classSections.map(
                              (classSection: any, csIdx: number) => {
                                const className =
                                  classSection.class?.name || "Unknown Class";
                                const sectionName =
                                  classSection.section?.name ||
                                  "Unknown Section";
                                const classId =
                                  classSection.class?._id ||
                                  classSection.class?.uuid;
                                const sectionId =
                                  classSection.section?._id ||
                                  classSection.section?.uuid;
                                const isSelected =
                                  selectedClassSection?.classId === classId &&
                                  selectedClassSection?.sectionId === sectionId;

                                return (
                                  <div
                                    key={
                                      classSection.class?._id +
                                        classSection.section?._id || csIdx
                                    }
                                    className={`bg-white border-2 rounded-lg p-4 cursor-pointer transition-all ${
                                      isSelected
                                        ? "border-blue-500 bg-blue-50 shadow-md"
                                        : "border-gray-300 hover:border-blue-300 hover:shadow-sm"
                                    }`}
                                    onClick={() => {
                                      if (!classId || !sectionId) return;
                                      void onSelectClassSection({
                                        classId,
                                        sectionId,
                                        className,
                                        sectionName,
                                      });
                                    }}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <h4 className="text-base font-semibold text-gray-900">
                                          {className}
                                        </h4>
                                        <p className="text-sm text-gray-600 mt-1">
                                          Section: {sectionName}
                                        </p>
                                      </div>
                                      {isSelected && (
                                        <div className="text-blue-600 text-xl">
                                          ✓
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                {/* Course progress data */}
                {msg.courseProgress && (msg as any).classSection && (
                  <div className="mt-4 p-4 bg-white border border-gray-300 rounded-lg shadow-md">
                    <div className="mb-4 pb-3 border-b border-gray-200">
                      <h4 className="text-lg font-semibold text-gray-900">
                        📊 Course Progress: {(msg as any).classSection.className}{" "}
                        {(msg as any).classSection.sectionName}
                      </h4>
                      {(msg.courseProgress as any).meta && (
                        <p className="text-sm text-gray-600 mt-1">
                          Total Subjects:{" "}
                          {(msg.courseProgress as any).meta.totalSubjects || 0}
                        </p>
                      )}
                    </div>
                    <div className="space-y-4 max-h-[600px] overflow-y-auto">
                      {(() => {
                        const progressData = msg.courseProgress as any;
                        const teacherDiarys =
                          progressData.teacherDiarys || progressData || [];

                        if (
                          !Array.isArray(teacherDiarys) ||
                          teacherDiarys.length === 0
                        ) {
                          return (
                            <div className="text-center py-8 text-gray-500">
                              No course progress data available.
                            </div>
                          );
                        }

                        const getProgressColor = (progress: number) => {
                          if (progress >= 75) return "bg-green-500";
                          if (progress >= 50) return "bg-yellow-500";
                          if (progress >= 25) return "bg-orange-500";
                          return "bg-red-500";
                        };

                        const getProgressBgColor = (progress: number) => {
                          if (progress >= 75) return "bg-green-100";
                          if (progress >= 50) return "bg-yellow-100";
                          if (progress >= 25) return "bg-orange-100";
                          return "bg-red-100";
                        };

                        return teacherDiarys.map(
                          (subject: any, subjectIdx: number) => {
                            const subjectName = subject.name || "Unknown Subject";
                            const avgProgress =
                              subject.avrage_progress ||
                              subject.average_progress ||
                              0;
                            const chapters = subject.chapters || [];

                            return (
                              <div
                                key={subject.id || subjectIdx}
                                className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm"
                              >
                                <div className="mb-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="text-base font-semibold text-gray-900">
                                      📚 {subjectName}
                                    </h5>
                                    <span
                                      className={`text-sm font-bold px-2 py-1 rounded ${
                                        avgProgress >= 75
                                          ? "text-green-700 bg-green-100"
                                          : avgProgress >= 50
                                          ? "text-yellow-700 bg-yellow-100"
                                          : avgProgress >= 25
                                          ? "text-orange-700 bg-orange-100"
                                          : "text-red-700 bg-red-100"
                                      }`}
                                    >
                                      {avgProgress}%
                                    </span>
                                  </div>
                                  <div
                                    className={`w-full h-3 rounded-full overflow-hidden ${getProgressBgColor(
                                      avgProgress
                                    )}`}
                                  >
                                    <div
                                      className={`h-full ${getProgressColor(
                                        avgProgress
                                      )} transition-all duration-500 ease-out`}
                                      style={{
                                        width: `${Math.min(avgProgress, 100)}%`,
                                      }}
                                    />
                                  </div>
                                </div>

                                {chapters.length > 0 ? (
                                  <div className="space-y-2">
                                    <h6 className="text-sm font-medium text-gray-700 mb-2">
                                      Chapters ({chapters.length}):
                                    </h6>
                                    {chapters.map(
                                      (chapter: any, chapterIdx: number) => {
                                        const chapterName =
                                          chapter.name || "Unknown Chapter";
                                        const chapterProgress =
                                          chapter.coverage_status || 0;

                                        return (
                                          <div
                                            key={chapter.id || chapterIdx}
                                            className="bg-white border border-gray-200 rounded-md p-3 hover:shadow-sm transition-shadow"
                                          >
                                            <div className="flex items-center justify-between mb-1">
                                              <span className="text-sm text-gray-800 font-medium">
                                                {chapterName}
                                              </span>
                                              <span
                                                className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                                  chapterProgress >= 75
                                                    ? "text-green-700 bg-green-100"
                                                    : chapterProgress >= 50
                                                    ? "text-yellow-700 bg-yellow-100"
                                                    : chapterProgress >= 25
                                                    ? "text-orange-700 bg-orange-100"
                                                    : "text-red-700 bg-red-100"
                                                }`}
                                              >
                                                {chapterProgress}%
                                              </span>
                                            </div>
                                            <div
                                              className={`w-full h-2 rounded-full overflow-hidden ${getProgressBgColor(
                                                chapterProgress
                                              )}`}
                                            >
                                              <div
                                                className={`h-full ${getProgressColor(
                                                  chapterProgress
                                                )} transition-all duration-500 ease-out`}
                                                style={{
                                                  width: `${Math.min(
                                                    chapterProgress,
                                                    100
                                                  )}%`,
                                                }}
                                              />
                                            </div>
                                          </div>
                                        );
                                      }
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-500 italic">
                                    No chapters available
                                  </div>
                                )}
                              </div>
                            );
                          }
                        );
                      })()}
                    </div>
                  </div>
                )}

                {msg.text ? (
                  <div>{msg.text}</div>
                ) : (
                  <>
                    {/* Leave approval requests UI */}
                    {activeFlow === "leave_approval" &&
                      idx === chatHistory.length - 1 && (
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
                                      {leaveApprovalRequests.length === 1
                                        ? "request"
                                        : "requests"}{" "}
                                      pending review
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {leaveApprovalRequests.map(
                                (request: any, reqIdx: number) => {
                                  const startDate = new Date(request.start_date);
                                  const endDate = new Date(request.end_date);
                                  const startDateStr = startDate.toLocaleDateString(
                                    "en-US",
                                    { month: "short", day: "numeric", year: "numeric" }
                                  );
                                  const endDateStr = endDate.toLocaleDateString(
                                    "en-US",
                                    { month: "short", day: "numeric", year: "numeric" }
                                  );
                                  const isSingleDay = startDateStr === endDateStr;
                                  const daysDiff =
                                    Math.ceil(
                                      (endDate.getTime() - startDate.getTime()) /
                                        (1000 * 60 * 60 * 24)
                                    ) + 1;

                                  const employeeName =
                                    request.employee?.personalInfo?.employeeName ||
                                    "Unknown";
                                  const employeeId =
                                    request.employee?.personalInfo?.employeeId ||
                                    "";
                                  const leaveType =
                                    request.leave_type?.name || "Unknown";
                                  const description =
                                    request.description || "No description provided";
                                  const photoPath =
                                    request.employee?.personalInfo?.photoDocument
                                      ?.path;

                                  return (
                                    <div
                                      key={request.uuid || reqIdx}
                                      className="bg-white border-2 border-gray-200 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
                                    >
                                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                                        <div className="flex items-center gap-4">
                                          {photoPath ? (
                                            <img
                                              src={photoPath}
                                              alt={employeeName}
                                              className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
                                              onError={(e) => {
                                                (e.target as HTMLImageElement).style.display =
                                                  "none";
                                              }}
                                            />
                                          ) : (
                                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-2xl font-bold shadow-md">
                                              {employeeName.charAt(0).toUpperCase()}
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

                                      <div className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
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
                                              {daysDiff} {daysDiff === 1 ? "day" : "days"}
                                            </p>
                                          </div>
                                        </div>

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

                                        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t-2 border-gray-200">
                                          <button
                                            onClick={() => void onApproveLeaveRequest(request)}
                                            className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                                          >
                                            <span className="text-xl">✓</span>
                                            <span>Approve</span>
                                          </button>

                                          <div className="flex-1 flex flex-col sm:flex-row gap-2">
                                            <input
                                              type="text"
                                              placeholder="Rejection reason (optional)"
                                              value={rejectReason[request.uuid] || ""}
                                              onChange={(e) =>
                                                onRejectReasonChange(
                                                  request.uuid,
                                                  e.target.value
                                                )
                                              }
                                              className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200 transition-all"
                                            />
                                            <button
                                              onClick={() => void onRejectLeaveRequest(request)}
                                              className="px-6 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg font-semibold hover:from-red-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2 whitespace-nowrap"
                                            >
                                              <span className="text-xl">✗</span>
                                              <span>Reject</span>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
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
                                All leave requests have been processed or there
                                are no pending requests at this time.
                              </p>
                            </div>
                          )}
                        </>
                      )}

                    {/* Attendance table */}
                    {msg.attendance_summary && msg.attendance_summary.length > 0 ? (
                      <div className="bg-white border border-gray-200 rounded-lg p-4 my-4 shadow-sm">
                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-300">
                          <div>
                            <h3 className="text-gray-900 m-0 mb-1 text-lg font-semibold">
                              {editingMessageIndex === idx || (msg as any).isBeingEdited
                                ? "✏️ Edit Attendance Summary"
                                : "📋 Attendance Summary"}
                            </h3>

                            {(editingMessageIndex === idx || (msg as any).isBeingEdited) && (
                              <div className="bg-blue-100 text-blue-900 p-2 rounded-md text-sm mb-4 font-medium">
                                ✏️ Edit mode active - You can modify student names
                                and attendance status below
                              </div>
                            )}

                            {(editingMessageIndex === idx || (msg as any).isBeingEdited) && (
                              <div className="flex gap-2 mb-4 p-2 rounded-md bg-gray-50 border border-gray-200">
                                <button
                                  onClick={() => void onSaveAttendance(idx)}
                                  className="px-4 py-2 rounded-md border-none bg-green-500 text-white cursor-pointer text-sm font-medium transition-colors hover:bg-green-600"
                                >
                                  💾 Save
                                </button>
                                <button
                                  onClick={() => onCancelAttendanceEdit(idx)}
                                  className="px-4 py-2 rounded-md border-none bg-red-500 text-white cursor-pointer text-sm font-medium transition-colors hover:bg-red-600"
                                >
                                  ❌ Cancel
                                </button>
                              </div>
                            )}

                            {classInfo && (
                              <p className="text-gray-500 m-0 text-sm">
                                Class {classInfo.class_} {classInfo.section} •{" "}
                                {classInfo.date}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-4 mb-4 p-3 rounded-md bg-gray-50 text-sm">
                          {(() => {
                            const isEditing =
                              editingMessageIndex === idx || (msg as any).isBeingEdited;
                            const dataToUse = isEditing ? attendanceData : msg.attendance_summary || [];
                            return (
                              <>
                                <div className="text-gray-900">
                                  <strong>Total:</strong> {dataToUse.length}
                                </div>
                                <div className="text-green-500">
                                  <strong>Present:</strong>{" "}
                                  {dataToUse.filter(
                                    (item) => item.attendance_status === "Present"
                                  ).length}
                                </div>
                                <div className="text-red-500">
                                  <strong>Absent:</strong>{" "}
                                  {dataToUse.filter(
                                    (item) => item.attendance_status === "Absent"
                                  ).length}
                                </div>
                              </>
                            );
                          })()}
                        </div>

                        <div className="overflow-auto border border-gray-200 rounded-md">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="px-3 py-3 text-left text-gray-900 font-semibold border-r border-gray-200">
                                  Student Name
                                </th>
                                <th className="px-3 py-3 text-left text-gray-900 font-semibold border-r border-gray-200">
                                  Status
                                </th>
                                <th className="px-3 py-3 text-center text-gray-900 font-semibold w-[100px]">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const isEditing =
                                  editingMessageIndex === idx || (msg as any).isBeingEdited;
                                const dataToUse = isEditing ? attendanceData : msg.attendance_summary || [];

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

                                return dataToUse.map((item, index) => (
                                  <tr
                                    key={index}
                                    className={`border-b border-gray-200 ${
                                      index % 2 === 0 ? "bg-white" : "bg-gray-50"
                                    }`}
                                  >
                                    <td className="px-3 py-3 border-r border-gray-200 text-gray-900">
                                      {isEditing ? (
                                        <input
                                          type="text"
                                          value={item.student_name}
                                          onChange={(e) =>
                                            onAttendanceDataChange(
                                              index,
                                              "student_name",
                                              e.target.value
                                            )
                                          }
                                          className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                        />
                                      ) : (
                                        <span className="text-sm">
                                          {item.student_name}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 border-r border-gray-200 text-gray-900">
                                      {isEditing ? (
                                        <select
                                          value={item.attendance_status}
                                          onChange={(e) =>
                                            onAttendanceDataChange(
                                              index,
                                              "attendance_status",
                                              e.target.value
                                            )
                                          }
                                          className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                        >
                                          <option value="Present">Present</option>
                                          <option value="Absent">Absent</option>
                                        </select>
                                      ) : (
                                        <span
                                          className={`text-sm ${
                                            item.attendance_status === "Present"
                                              ? "text-green-500"
                                              : item.attendance_status === "Absent"
                                              ? "text-red-500"
                                              : "text-gray-500"
                                          }`}
                                        >
                                          {item.attendance_status}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      {isEditing && (
                                        <button
                                          onClick={() => onRemoveStudent(index)}
                                          className="px-1 py-1 border-none bg-red-500 text-white rounded cursor-pointer flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                                          title="Remove Student"
                                        >
                                          🗑️
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ));
                              })()}
                            </tbody>
                          </table>
                        </div>

                        {(editingMessageIndex === idx || (msg as any).isBeingEdited) && (
                          <div
                            style={{
                              marginTop: "1rem",
                              padding: "1rem",
                              background: "#f8fafc",
                              borderRadius: "6px",
                              border: "1px solid #e5e7eb",
                            }}
                          >
                            <button
                              onClick={onAddStudent}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                padding: "0.5rem 1rem",
                                borderRadius: "6px",
                                border: "none",
                                background: "#2563eb",
                                color: "white",
                                cursor: "pointer",
                                fontSize: "0.875rem",
                                fontWeight: "500",
                                transition: "background 0.2s",
                              }}
                            >
                              ➕ Add New Student
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <MemoizedAnswer answer={msg.answer || ""} messageIdx={idx} />
                    )}

                    <div className="bot-actions-bottom">
                      <button
                        className="bot-action-btn"
                        title="Listen"
                        disabled={ttsLoading === idx}
                        onClick={() => void onPlayTTS(idx, msg.answer || "")}
                      >
                        <FiVolume2 />
                        {ttsLoading === idx && (
                          <span className="feedback-sent-tooltip">Loading...</span>
                        )}
                      </button>
                      <button
                        className={getThumbsUpClass(msg)}
                        title="Approved"
                        disabled={msg.feedback === "Rejected"}
                        onClick={() => void onSendFeedback(idx, "Approved")}
                      >
                        <FiThumbsUp />
                        {msg.feedback === "Approved" && (
                          <span className="feedback-sent-tooltip">Approved</span>
                        )}
                      </button>
                      <div style={{ position: "relative" }}>
                        <button
                          className={getThumbsDownClass(msg)}
                          title="Rejected"
                          disabled={msg.feedback === "Approved"}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCorrectionBox(
                              showCorrectionBox === idx ? null : idx
                            );
                          }}
                        >
                          <FiThumbsDown />
                          {msg.feedback === "Rejected" && (
                            <span className="feedback-sent-tooltip">Rejected</span>
                          )}
                        </button>
                        {showCorrectionBox === idx && msg.feedback !== "Approved" && (
                          <div className="correction-box" ref={correctionBoxRef}>
                            <div className="correction-title">
                              Rejection Reason:
                            </div>
                            <input
                              className="correction-input"
                              type="text"
                              placeholder="Enter reason..."
                              value={feedbackComment[idx] || ""}
                              onChange={(e) =>
                                onFeedbackCommentChange(idx, e.target.value)
                              }
                            />
                            <button
                              className="correction-btn"
                              onClick={() =>
                                void onSendFeedback(
                                  idx,
                                  "Rejected",
                                  feedbackComment[idx] || ""
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
                      <div className="feedback-status-msg">{msg.feedbackMessage}</div>
                    )}

                    {(msg as any).buttons && (msg as any).buttons.length > 0 && (
                      <div className="bot-buttons">
                        {(msg as any).buttons.map((btn: any, i: number) => (
                          <button
                            key={i}
                            className="bot-text-btn"
                            onClick={btn.action}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}

        {isProcessing && (
          <div className="chatbot-msg-row bot">
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
                <span className="thinking-text italic">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatConversation;
