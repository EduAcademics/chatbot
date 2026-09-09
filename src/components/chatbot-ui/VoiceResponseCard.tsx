import { FiThumbsDown, FiThumbsUp, FiVolume2 } from "react-icons/fi";
import MemoizedAnswer from "../MemoizedAnswer";
import KpiCardRow from "../KpiCardRow";
import FindingsList from "../FindingsList";
import PaginatedDataTable from "../PaginatedDataTable";
import HybridActionPanel from "../HybridActionPanel";
import VisualizationRenderer from "../VisualizationRenderer";
import ManagerBriefDashboard from "../ManagerBriefDashboard";
import { resolveManagerBrief } from "../../utils/resolveManagerBrief";
import { getThumbsUpClass, getThumbsDownClass } from "../utils/chatbotUtils";

export interface VoiceResponseCardProps {
  message: any;
  index: number;
  userQuestion?: string;
  ttsLoading: number | null;
  handlePlayTTS: (
    idx: number,
    text: string,
    isQuery?: boolean,
    uuidQuestion?: string,
    ttsContext?: import("../types").TtsQueryContext,
  ) => Promise<void>;
  handleSendFeedback: (
    idx: number,
    type: "Approved" | "Rejected",
    comment?: string,
  ) => Promise<void>;
  showCorrectionBox: number | null;
  setShowCorrectionBox: (v: number | null) => void;
  feedbackComment: { [idx: number]: string };
  setFeedbackComment: React.Dispatch<
    React.SetStateAction<{ [idx: number]: string }>
  >;
  correctionBoxRef: React.RefObject<HTMLDivElement | null>;
  onOpenPreview: (url: string, filename: string) => void;
  userId?: string;
  getErpContext?: () => { academic_session: string; branch_token: string };
  setChatHistory?: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function VoiceResponseCard({
  message: msg,
  index: idx,
  userQuestion,
  ttsLoading,
  handlePlayTTS,
  handleSendFeedback,
  showCorrectionBox,
  setShowCorrectionBox,
  feedbackComment,
  setFeedbackComment,
  correctionBoxRef,
  onOpenPreview,
  userId,
  getErpContext,
  setChatHistory,
}: VoiceResponseCardProps) {
  const answerText = msg.answer || msg.text || "";
  const managerBrief = resolveManagerBrief(msg);

  return (
    <div className="voice-response-card">
      {userQuestion ? (
        <p className="voice-response-question" title={userQuestion}>
          “{userQuestion}”
        </p>
      ) : null}

      <div className="voice-response-body">
        {managerBrief ? (
          <ManagerBriefDashboard
            data={managerBrief}
            actionOptions={msg.action_options}
          />
        ) : (
          <>
            {msg.kpi_cards?.length ? <KpiCardRow cards={msg.kpi_cards} /> : null}
            <MemoizedAnswer
              answer={answerText}
              messageIdx={idx}
              onOpenPreview={onOpenPreview}
            />
            {msg.findings?.length ? <FindingsList items={msg.findings} /> : null}
            {msg.hybrid_action_available &&
            msg.hybrid_session_id &&
            msg.table_data?.rows?.length &&
            userId &&
            getErpContext &&
            setChatHistory ? (
              <HybridActionPanel
                tableData={msg.table_data}
                hybridSessionId={msg.hybrid_session_id}
                actionType={msg.action_type}
                userId={userId}
                getErpContext={getErpContext}
                sent={msg.hybrid_sent}
                onSent={(answer) => {
                  setChatHistory((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], hybrid_sent: true };
                    return [
                      ...next,
                      { type: "bot", answer, activeTab: "answer" as const },
                    ];
                  });
                }}
                onError={(message) => {
                  setChatHistory((prev) => [
                    ...prev,
                    { type: "bot", answer: message, activeTab: "answer" as const },
                  ]);
                }}
              />
            ) : msg.table_data?.rows?.length ? (
              <PaginatedDataTable
                tableData={msg.table_data}
                downloadFilename="query-results.csv"
                showDownload={!msg.catalog_id?.trim()}
              />
            ) : null}
            {msg.visualization?.show_chart &&
            msg.visualization &&
            !msg.hybrid_action_available ? (
              <VisualizationRenderer visualization={msg.visualization} />
            ) : null}
          </>
        )}
      </div>

      <div className="bot-actions-bottom voice-response-actions">
        <button
          className="bot-action-btn"
          title="Listen"
          disabled={ttsLoading === idx}
          onClick={() =>
            handlePlayTTS(
              idx,
              answerText,
              Boolean(msg.answer) || Boolean(msg.uuid_question) || Boolean(msg.table_data),
              msg.uuid_question,
              {
                backend_tts_text: msg.tts_text,
                tts_summary_ready: msg.tts_summary_ready,
                table_data: msg.table_data,
                findings: msg.findings,
                kpi_cards: msg.kpi_cards,
              },
            )
          }
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
          onClick={() => handleSendFeedback(idx, "Approved")}
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
              setShowCorrectionBox(showCorrectionBox === idx ? null : idx);
            }}
          >
            <FiThumbsDown />
            {msg.feedback === "Rejected" && (
              <span className="feedback-sent-tooltip">Rejected</span>
            )}
          </button>
          {showCorrectionBox === idx && msg.feedback !== "Approved" && (
            <div className="correction-box" ref={correctionBoxRef}>
              <div className="correction-title">Rejection Reason:</div>
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
                  handleSendFeedback(idx, "Rejected", feedbackComment[idx] || "")
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
    </div>
  );
}
