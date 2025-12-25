/**
 * useChatController.ts
 *
 * RESPONSIBILITY: Orchestration, replaces handleSubmit
 * - Calls router
 * - Delegates to flows
 * - Updates chat history
 * - Manages state transitions
 */

import { useCallback } from "react";
import { routeMessage, isExitCommand } from "./chatRouter";
import type { FlowType } from "./chatRouter";
import { executeFlow } from "./chatFlows";
import type { FlowContext } from "./chatFlows";

export interface UseChatControllerOptions {
  userId: string;
  roles: string;
  email: string;
  sessionId: string | null;
  activeFlow: FlowType;
  attendanceStep: "class_info" | "student_details" | "completed";
  pendingClassInfo: any;
  classSections: any[];
  selectedClassSection: any;
  leaveApprovalRequests: any[];
  loadingLeaveRequests: boolean;
  userOptionSelected: boolean;
  autoRouting: boolean;
  onUpdateChatHistory: (message: any) => void;
  onSetActiveFlow: (flow: FlowType) => void;
  onSetAttendanceStep: (
    step: "class_info" | "student_details" | "completed"
  ) => void;
  onSetPendingClassInfo: (info: any) => void;
  onSetAttendanceData: (data: any[]) => void;
  onSetClassInfo: (info: any) => void;
  onSetClassSections: (sections: any[]) => void;
  onSetSelectedClassSection: (section: any) => void;
  onSetLeaveApprovalRequests: (requests: any[]) => void;
  onSetUserOptionSelected: (selected: boolean) => void;
  onSetIsProcessing: (processing: boolean) => void;
  onSetDetectedFlow: (flow: string | null) => void;
  onSetClassificationConfidence: (confidence: number) => void;
  getAttendanceDataForApproval: (messageIndex?: number) => any;
  getEditingMessageIndex: () => number | null;
  getChatHistoryLength: () => number;
  onFlowSignal?: (signals: {
    keep_listening?: boolean;
    flow_status?: string;
    voice_mode_active?: boolean;
  }) => void;
  createAttendanceButtons: (
    attendanceData: any[],
    classInfo: any,
    messageIndex: number,
    type: "text" | "voice" | "image"
  ) => { label: string; action: () => void }[];
  isVoiceInputRef?: React.MutableRefObject<boolean>;
  activeFlowRef?: React.MutableRefObject<string>;
}

export const useChatController = (options: UseChatControllerOptions) => {
  const {
    userId,
    roles,
    sessionId,
    activeFlow,
    attendanceStep,
    pendingClassInfo,
    classSections,
    selectedClassSection,
    leaveApprovalRequests,
    loadingLeaveRequests,
    userOptionSelected,
    autoRouting,
    onUpdateChatHistory,
    onSetActiveFlow,
    onSetAttendanceStep,
    onSetPendingClassInfo,
    onSetAttendanceData,
    onSetClassInfo,
    onSetClassSections,
    onSetSelectedClassSection,
    onSetLeaveApprovalRequests,
    onSetUserOptionSelected,
    onSetIsProcessing,
    onSetDetectedFlow,
    onSetClassificationConfidence,
    createAttendanceButtons,
    onFlowSignal,
    isVoiceInputRef,
    activeFlowRef,
  } = options;

  const handleSubmit = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim()) return;

      const trimmedMessage = userMessage.trim();

      // Use ref for more reliable active flow detection (state may be stale)
      const currentActiveFlow = activeFlowRef?.current || activeFlow;

      console.log("🚀 handleSubmit START:", {
        userMessage: trimmedMessage,
        activeFlow,
        activeFlowRef: activeFlowRef?.current,
        currentActiveFlow,
        userOptionSelected,
        autoRouting,
      });

      // Add user message to chat history
      onUpdateChatHistory({ type: "user", text: trimmedMessage });
      onSetIsProcessing(true);

      // CHECK FOR EXIT KEYWORDS
      if (
        isExitCommand(trimmedMessage) &&
        activeFlow !== "none" &&
        activeFlow !== "query"
      ) {
        console.log("🚪 Exit command detected, exiting flow:", activeFlow);
        onSetActiveFlow("none");
        onSetAttendanceStep("class_info");
        onSetPendingClassInfo(null);
        onUpdateChatHistory({
          type: "bot",
          text: `✅ Exited from ${activeFlow} flow. Welcome back! You can ask me anything or use the dropdown to select a specific flow.`,
        });
        onSetIsProcessing(false);
        onSetDetectedFlow(null);
        return;
      }

      // Route message - use currentActiveFlow (from ref) for reliable routing
      const routerContext = {
        activeFlow: currentActiveFlow as FlowType,
        attendanceStep,
        pendingClassInfo,
        userOptionSelected,
        autoRouting,
      };

      console.log("📍 Router context:", routerContext);

      const routingResult = await routeMessage(
        trimmedMessage,
        routerContext,
        userId,
        roles
      );

      let targetFlow = routingResult.targetFlow;
      const classificationResult = routingResult.classificationResult;

      console.log("📍 Target flow determined:", targetFlow);

      // Update UI to show detected flow
      if (classificationResult) {
        onSetDetectedFlow(targetFlow);
        onSetClassificationConfidence(classificationResult.confidence);
      } else {
        onSetDetectedFlow(null);
      }

      // Set userOptionSelected to true when auto-routing detects a flow
      if (autoRouting && classificationResult) {
        onSetUserOptionSelected(true);
      }

      // Initialize flow state when detected
      if (targetFlow === "attendance" || targetFlow === "voice_attendance") {
        if (
          !(
            currentActiveFlow === "attendance" &&
            attendanceStep === "student_details" &&
            pendingClassInfo
          ) &&
          !(
            currentActiveFlow === "voice_attendance" &&
            attendanceStep === "student_details" &&
            pendingClassInfo
          )
        ) {
          console.log("📍 Initializing attendance flow state");
          onSetAttendanceStep("class_info");
          onSetPendingClassInfo(null);

          // Add welcome message for auto-detected attendance flow
          onUpdateChatHistory({
            type: "bot",
            text: "✅ Attendance flow detected! I'll help you mark attendance. Please provide class information (class name, section, and date). For example: 'Class 3 A on 2025-12-06' or 'Class 6 section B today'.",
          });
        }
      }

      // Check if this is a new flow initialization
      const isNewFlowInitialization =
        classificationResult &&
        (currentActiveFlow === "none" ||
          currentActiveFlow === "query" ||
          currentActiveFlow !== targetFlow);

      // Initialize assignment flow
      if (targetFlow === "assignment" && isNewFlowInitialization) {
        console.log("📍 Initializing assignment flow state");
        onSetActiveFlow("assignment");
        // Don't return here - let the user's message be processed by the API
      }

      // Initialize leave flow
      if (targetFlow === "leave" && isNewFlowInitialization) {
        console.log("📍 Initializing leave flow state");
        onSetActiveFlow("leave");

        // Add welcome message matching manual mode
        onUpdateChatHistory({
          type: "bot",
          text: "📝 **Leave Application Flow Activated!** I'll help you apply for leave. Please provide details like:\n• Start date and end date\n• Leave type (sick, casual, earned, etc.)\n• Reason for leave",
        });

        // Stop here - don't process the initialization message
        onSetIsProcessing(false);
        return;
      }

      // If still no flow selected after classification, prompt user
      if (!userOptionSelected && targetFlow === "none") {
        onUpdateChatHistory({
          type: "bot",
          text: "Please select an option from the menu, or I'll try to detect what you need automatically. Try asking something like 'Mark attendance for class 6A' or 'Apply for leave tomorrow'.",
        });
        onSetIsProcessing(false);
        return;
      }

      console.log("📍 Routing to flow:", targetFlow);

      // Update active flow for next message (unless manually overridden)
      if (autoRouting) {
        onSetActiveFlow(targetFlow);
      }

      // Prepare flow context
      const flowContext: FlowContext = {
        sessionId,
        userId,
        roles,
        activeFlow: targetFlow,
        attendanceStep,
        pendingClassInfo,
        classSections,
        selectedClassSection,
        leaveApprovalRequests,
        loadingLeaveRequests,
        isVoiceInput: isVoiceInputRef?.current || false,
      };

      console.log("[useChatController] 📤 Executing flow with context:", {
        targetFlow,
        isVoiceInput: flowContext.isVoiceInput,
        isVoiceInputRef: isVoiceInputRef?.current,
      });

      // Execute flow
      const flowResult = await executeFlow(
        targetFlow,
        trimmedMessage,
        flowContext
      );

      console.log("[useChatController] 📥 Flow result received:", {
        success: flowResult.success,
        hasMessage: !!flowResult.message,
        messageType: flowResult.message?.type,
        hasData: !!flowResult.message?.data,
        dataKeys: flowResult.message?.data
          ? Object.keys(flowResult.message.data)
          : [],
      });

      // Handle flow result
      if (flowResult.success && flowResult.message) {
        // Add buttons for attendance flows
        if (
          (targetFlow === "attendance" ||
            targetFlow === "voice_attendance" ||
            targetFlow === "full_voice_attendance") &&
          flowResult.shouldUpdateAttendanceData &&
          flowResult.shouldUpdateAttendanceData.length > 0
        ) {
          const messageIndex = options.getChatHistoryLength();
          const attendanceType =
            targetFlow === "attendance"
              ? "text"
              : targetFlow === "voice_attendance"
              ? "voice"
              : "image";

          (flowResult.message as any).buttons = createAttendanceButtons(
            flowResult.shouldUpdateAttendanceData,
            flowResult.shouldUpdateClassInfo,
            messageIndex,
            attendanceType
          );
        }

        // Component 2, Change 4: Parse keep_listening from assignment response
        console.log(
          "[useChatController] Checking for assignment flow signals:",
          {
            targetFlow,
            hasData: !!flowResult.message.data,
            keepListening: flowResult.message.data?.keep_listening,
            flowStatus: flowResult.message.data?.flow_status,
          }
        );

        if (
          targetFlow === "assignment" &&
          flowResult.message.data?.keep_listening !== undefined
        ) {
          (flowResult.message as any).keep_listening =
            flowResult.message.data.keep_listening;
          (flowResult.message as any).flow_status =
            flowResult.message.data.flow_status;
          (flowResult.message as any).fields_remaining =
            flowResult.message.data.fields_remaining;
          (flowResult.message as any).play_audio =
            flowResult.message.data.play_audio;

          // VOICE MODE DETECTION: If voice input and flow signals are present, activate voice mode
          if (
            isVoiceInputRef?.current &&
            flowResult.message.data?.flow_status
          ) {
            console.log(
              "[useChatController] 🎤 Voice mode activated for assignment"
            );
            // We'll let the frontend component handle the voice mode state update
            // Just log it for debugging
          }

          console.log(
            "[useChatController] Assignment response with flow signals:",
            {
              keep_listening: flowResult.message.data.keep_listening,
              flow_status: flowResult.message.data.flow_status,
              fields_remaining: flowResult.message.data.fields_remaining,
            }
          );

          // FIX 2b: Call onFlowSignal callback to trigger TTS and voice mode updates
          if (onFlowSignal) {
            onFlowSignal({
              keep_listening: flowResult.message.data.keep_listening,
              flow_status: flowResult.message.data.flow_status,
              voice_mode_active: isVoiceInputRef?.current ? true : false,
            });
          }
        }

        onUpdateChatHistory(flowResult.message);
      } else if (flowResult.message) {
        onUpdateChatHistory(flowResult.message);
      }

      // Update state based on flow result
      if (flowResult.shouldUpdateStep) {
        onSetAttendanceStep(flowResult.shouldUpdateStep);
      }
      if (flowResult.shouldUpdateClassInfo) {
        onSetPendingClassInfo(flowResult.shouldUpdateClassInfo);
        onSetClassInfo(flowResult.shouldUpdateClassInfo);
      }
      if (flowResult.shouldUpdateAttendanceData) {
        onSetAttendanceData(flowResult.shouldUpdateAttendanceData);
      }
      if (flowResult.shouldUpdateClassSections) {
        onSetClassSections(flowResult.shouldUpdateClassSections);
      }
      if (flowResult.shouldUpdateSelectedClassSection) {
        onSetSelectedClassSection(flowResult.shouldUpdateSelectedClassSection);
      }
      if (flowResult.shouldUpdateLeaveRequests) {
        onSetLeaveApprovalRequests(flowResult.shouldUpdateLeaveRequests);
      }
      if (flowResult.shouldUpdateFlow) {
        setTimeout(() => {
          onSetActiveFlow("none");
        }, 1000);
      }

      onSetIsProcessing(false);
    },
    [
      userId,
      roles,
      sessionId,
      activeFlow,
      attendanceStep,
      pendingClassInfo,
      classSections,
      selectedClassSection,
      leaveApprovalRequests,
      loadingLeaveRequests,
      userOptionSelected,
      autoRouting,
      onUpdateChatHistory,
      onSetActiveFlow,
      onSetAttendanceStep,
      onSetPendingClassInfo,
      onSetAttendanceData,
      onSetClassInfo,
      onSetClassSections,
      onSetSelectedClassSection,
      onSetLeaveApprovalRequests,
      onSetUserOptionSelected,
      onSetIsProcessing,
      onSetDetectedFlow,
      onSetClassificationConfidence,
      createAttendanceButtons,
      options,
    ]
  );

  return {
    handleSubmit,
  };
};
