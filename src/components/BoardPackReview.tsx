import { useEffect, useState } from "react";
import { FiCheckCircle, FiDownload, FiXCircle } from "react-icons/fi";
import { boardPackAPI } from "../services/api";
import type { ChatMessage } from "./types";

type ReviewStatus = "draft" | "approved" | "rejected" | "loading";

interface BoardPackReviewProps {
  message: ChatMessage;
  userId: string;
  academicSession: string;
}

export default function BoardPackReview({
  message,
  userId,
  academicSession,
}: BoardPackReviewProps) {
  const [status, setStatus] = useState<ReviewStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const uuid = message.uuid_question;
  if (!uuid) return null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await boardPackAPI.getReview(uuid);
        if (cancelled) return;
        setStatus((res.review?.status as ReviewStatus) || "draft");
      } catch {
        if (!cancelled) setStatus("draft");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uuid]);

  const snapshot = () => ({
    catalog_id: message.catalog_id || "management_q12",
    academic_session: academicSession,
    summary: message.answer || "",
    kpi_cards: message.kpi_cards || [],
    findings: message.findings || [],
    recommendations: message.recommendations || [],
  });

  const handleApprove = async () => {
    setBusy(true);
    try {
      const res = await boardPackAPI.approve({
        uuid_question: uuid,
        user_id: userId,
        academic_session: academicSession,
        snapshot: snapshot(),
      });
      if (res.status === "success") {
        setStatus("approved");
        setNote("Board pack approved and archived.");
      } else {
        setNote(res.message || "Approval failed.");
      }
    } catch {
      setNote("Approval failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      const res = await boardPackAPI.reject({
        uuid_question: uuid,
        user_id: userId,
      });
      if (res.status === "success") {
        setStatus("rejected");
        setNote("Board pack marked as rejected.");
      } else {
        setNote(res.message || "Reject failed.");
      }
    } catch {
      setNote("Reject failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      await boardPackAPI.downloadExport(uuid);
    } catch {
      setNote("Download failed. Approve the pack first.");
    } finally {
      setBusy(false);
    }
  };

  const statusLabel =
    status === "approved"
      ? "Approved"
      : status === "rejected"
        ? "Rejected"
        : "Draft";

  return (
    <div className="board-pack-review mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800">
          Trustee Review
        </div>
        <span className={`board-pack-status board-pack-status-${status}`}>
          {statusLabel}
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-600">
        Review this draft, then approve to archive and download for trustees.
      </p>
      <div className="flex flex-wrap gap-2">
        {status !== "approved" ? (
          <button
            type="button"
            className="board-pack-btn board-pack-btn-approve"
            disabled={busy || status === "rejected"}
            onClick={handleApprove}
          >
            <FiCheckCircle />
            Approve
          </button>
        ) : null}
        {status !== "rejected" && status !== "approved" ? (
          <button
            type="button"
            className="board-pack-btn board-pack-btn-reject"
            disabled={busy}
            onClick={handleReject}
          >
            <FiXCircle />
            Reject
          </button>
        ) : null}
        {status === "approved" ? (
          <button
            type="button"
            className="board-pack-btn board-pack-btn-download"
            disabled={busy}
            onClick={handleDownload}
          >
            <FiDownload />
            Download report
          </button>
        ) : null}
      </div>
      {note ? <p className="mt-2 text-sm text-emerald-700">{note}</p> : null}
    </div>
  );
}
