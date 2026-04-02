import { useState } from "react";
import "./markdown-tables.css";
import "./chatbot.css";
import ClassInfoModal from "./ClassInfoModal";
import ChatInputArea from "./ChatInputArea";
import ChatHeaderWithMenu from "./ChatHeaderWithMenu";
import ChatMessageList from "./ChatMessageList";
import FilePreviewModal from "./FilePreviewModal";
import { useChatbot } from "./hooks/useChatbot";

const AudioStreamerChatBot = ({
  userId,
  roles,
  loginId,
}: {
  userId: string;
  roles: string;
  loginId: string;
}) => {
  const api = useChatbot({ userId, roles, loginId });
  // const api = useChatbot({ userId, roles, email });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string>("Attachment");

  const handleOpenPreview = (url: string, filename: string) => {
    setPreviewUrl(url);
    setPreviewFilename(filename || "Attachment");
  };

  const handleClosePreview = () => {
    setPreviewUrl(null);
    setPreviewFilename("Attachment");
  };

  return (
    <>
      <ClassInfoModal
        isOpen={api.showClassInfoModal}
        onClose={api.handleClassInfoCancel}
        onConfirm={api.handleClassInfoConfirm}
      />

      <div className="chatbot-root">
        <div className="chatbot-container">
          <ChatHeaderWithMenu
            menuRef={api.menuRef}
            isMenuOpen={api.isMenuOpen}
            setIsMenuOpen={api.setIsMenuOpen}
            setAutoRouting={api.setAutoRouting}
            handleFlowExit={api.handleFlowExit}
            setUserOptionSelected={api.setUserOptionSelected}
            setChatHistory={api.setChatHistory}
            activeFlow={api.activeFlow}
            setActiveFlow={api.setActiveFlow}
            attendanceStep={api.attendanceStep}
            setAttendanceStep={api.setAttendanceStep}
            setPendingClassInfo={api.setPendingClassInfo}
            hoveredMenuItem={api.hoveredMenuItem}
            setHoveredMenuItem={api.setHoveredMenuItem}
            hoverTimeoutRef={api.hoverTimeoutRef}
            getErpContext={api.getErpContext}
            sessionId={api.sessionId}
            userId={api.userId}
            activeFlowRef={api.activeFlowRef}
            setIsProcessing={api.setIsProcessing}
            setLeaveApprovalRequests={api.setLeaveApprovalRequests}
            setRejectReason={api.setRejectReason}
            setLoadingLeaveRequests={api.setLoadingLeaveRequests}
            devices={api.devices}
            selectedDeviceId={api.selectedDeviceId}
            setSelectedDeviceId={api.setSelectedDeviceId}
            languages={api.languages}
            selectedLanguage={api.selectedLanguage}
            setSelectedLanguage={api.setSelectedLanguage}
          />
          <ChatMessageList
            chatBoxRef={api.chatBoxRef}
            chatHistory={api.chatHistory}
            activeFlow={api.activeFlow}
            attendanceStep={api.attendanceStep}
            isProcessing={api.isProcessing}
            ttsLoading={api.ttsLoading}
            editingMessageIndex={api.editingMessageIndex}
            setEditingMessageIndex={api.setEditingMessageIndex}
            attendanceData={api.attendanceData}
            setAttendanceData={api.setAttendanceData}
            classInfo={api.classInfo}
            setClassInfo={api.setClassInfo}
            showCorrectionBox={api.showCorrectionBox}
            setShowCorrectionBox={api.setShowCorrectionBox}
            feedbackComment={api.feedbackComment}
            setFeedbackComment={api.setFeedbackComment}
            correctionBoxRef={api.correctionBoxRef}
            handlePlayTTS={api.handlePlayTTS}
            handleSendFeedback={api.handleSendFeedback}
            handleAttendanceDataChange={api.handleAttendanceDataChange}
            handleAddStudent={api.handleAddStudent}
            handleRemoveStudent={api.handleRemoveStudent}
            handleSaveAttendance={api.handleSaveAttendance}
            handleSaveColumn={api.handleSaveColumn}
            handleUnifiedAttendanceApproval={
              api.handleUnifiedAttendanceApproval
            }
            handleTextAttendanceRejection={api.handleTextAttendanceRejection}
            setActiveFlow={api.setActiveFlow}
            setAttendanceStep={api.setAttendanceStep}
            setChatHistory={api.setChatHistory}
            leaveApprovalRequests={api.leaveApprovalRequests}
            setLeaveApprovalRequests={api.setLeaveApprovalRequests}
            loadingLeaveRequests={api.loadingLeaveRequests}
            rejectReason={api.rejectReason}
            setRejectReason={api.setRejectReason}
            userId={api.userId}
            getErpContext={api.getErpContext}
            onOpenPreview={handleOpenPreview}
          />
          <ChatInputArea
            activeFlow={api.activeFlow}
            inputText={api.inputText}
            setInputText={api.setInputText}
            isRecording={api.isRecording}
            fullVoiceMode={api.fullVoiceMode}
            setFullVoiceMode={api.setFullVoiceMode}
            isVoiceActive={api.isVoiceActive}
            handleSubmit={api.handleSubmit}
            startStreaming={api.startStreaming}
            stopStreaming={api.stopStreaming}
            setChatHistory={api.setChatHistory}
            sessionId={api.sessionId}
            userId={api.userId}
            classInfo={api.classInfo}
            pendingClassInfo={api.pendingClassInfo}
            attendanceFlowState={api.attendanceFlowState}
            attendanceStep={api.attendanceStep}
            getAttendanceFlowCallbacks={api.getAttendanceFlowCallbacks}
            setPendingImageFile={api.setPendingImageFile}
            setShowClassInfoModal={api.setShowClassInfoModal}
            uploadFile={api.uploadFile}
            getErpContext={api.getErpContext}
            activeVoiceButtonRef={api.activeVoiceButtonRef}
            handlePlayTTS={api.handlePlayTTS}
          />
        </div>
      </div>

      {previewUrl && (
        <FilePreviewModal
          url={previewUrl}
          filename={previewFilename}
          onClose={handleClosePreview}
        />
      )}
    </>
  );
};

export default AudioStreamerChatBot;
