import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "./markdown-tables.css";
import "./chatbot.css";
import "./schoolos-ui.css";
import ClassInfoModal from "./ClassInfoModal";
import ChatInputArea from "./ChatInputArea";
import ChatHeaderWithMenu from "./ChatHeaderWithMenu";
import ChatMessageList from "./ChatMessageList";
import FilePreviewModal from "./FilePreviewModal";
import HomeView from "./chatbot-ui/HomeView";
import VoiceView from "./chatbot-ui/VoiceView";
import type { ChatbotScreen } from "./chatbotData";
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
  const [screen, setScreen] = useState<ChatbotScreen>("home");

  const handleSelectPrompt = (prompt: string) => {
    setScreen("chat");
    void api.handleSubmit(prompt);
  };

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
          <AnimatePresence mode="wait">
          {screen === "home" && (
            <motion.div
              key="home"
              className="chatbot-screen-motion"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
            <HomeView
              userName={loginId}
              roles={roles}
              onNavigate={(next) => setScreen(next)}
              onSelectPrompt={handleSelectPrompt}
            />
            </motion.div>
          )}

          {screen === "voice" && (
            <motion.div
              key="voice"
              className="chatbot-screen-motion"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
            <VoiceView
              onBack={() => setScreen("home")}
              onOpenChat={() => setScreen("chat")}
              transcript={api.inputText}
              isCapturing={api.isPttCapturing}
              isConnecting={api.isPttConnecting}
              isListening={api.isVoiceActive || api.isRecording}
              isProcessing={api.isProcessing}
              handlePttDown={api.handlePttDown}
              handlePttUp={api.handlePttUp}
              chatHistory={api.chatHistory}
              ttsLoading={api.ttsLoading}
              handlePlayTTS={api.handlePlayTTS}
              handleSendFeedback={api.handleSendFeedback}
              showCorrectionBox={api.showCorrectionBox}
              setShowCorrectionBox={api.setShowCorrectionBox}
              feedbackComment={api.feedbackComment}
              setFeedbackComment={api.setFeedbackComment}
              correctionBoxRef={api.correctionBoxRef}
              onOpenPreview={handleOpenPreview}
            />
            </motion.div>
          )}

          {screen === "chat" && (
          <motion.div
            key="chat"
            className="chatbot-screen-motion chatbot-screen-motion--chat"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
          <ChatHeaderWithMenu
            onBack={() => setScreen("home")}
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
            studentLeaveApprovalRequests={api.studentLeaveApprovalRequests}
            setStudentLeaveApprovalRequests={
              api.setStudentLeaveApprovalRequests
            }
            loadingStudentLeaveRequests={api.loadingStudentLeaveRequests}
            studentRejectReason={api.studentRejectReason}
            setStudentRejectReason={api.setStudentRejectReason}
            userId={api.userId}
            getErpContext={api.getErpContext}
            onOpenPreview={handleOpenPreview}
            handleSubmit={api.handleSubmit}
            userRoles={
              api.roles
                ? api.roles.split(",").map((r: string) => r.trim()).filter(Boolean)
                : []
            }
            speakHealthCardBotMessage={api.speakHealthCardBotMessage}
            onSelectPrompt={handleSelectPrompt}
          />
          <ChatInputArea
            autoFocus
            textOnly
            activeFlow={api.activeFlow}
            inputText={api.inputText}
            setInputText={api.setInputText}
            isRecording={api.isRecording}
            isPttCapturing={api.isPttCapturing}
            isPttConnecting={api.isPttConnecting}
            isVoiceActive={api.isVoiceActive}
            handleSubmit={api.handleSubmit}
            handlePttDown={api.handlePttDown}
            handlePttUp={api.handlePttUp}
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
            fullVoiceMode={api.fullVoiceMode}
          />
          </motion.div>
          )}
          </AnimatePresence>
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
