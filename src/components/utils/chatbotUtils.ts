/**
 * Chatbot shared utilities (exit detection, TTS summary, feedback CSS).
 * Pure functions only – no React or side effects.
 */

/**
 * Detects if a backend response indicates an exit.
 * Checks both explicit exit flags and message content.
 */
export function isExitResponse(response: any): boolean {
  const actualData = response?.data || response;

  if (
    actualData.state_cleared === true ||
    actualData.exit_type === "user_initiated" ||
    actualData.exited === true
  ) {
    return true;
  }

  const message =
    actualData.answer ||
    actualData.message ||
    response.answer ||
    response.message ||
    "";
  const exitPatterns = [
    "✅ Exited",
    "exited from",
    "You've exited",
    "Exited from",
    "Welcome back",
  ];

  return exitPatterns.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Strip markdown and truncate for query-flow TTS playback.
 */
export function generateQueryTTSSummary(answer: string): string {
  if (!answer || !answer.trim()) return "No response.";
  const cleaned = answer
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/📝|✅|❌|⚠️|🚫|•|🎯|📋|🔍|#/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const max = 300;
  return cleaned.length <= max
    ? cleaned
    : cleaned.substring(0, max).trim() + "...";
}

/**
 * CSS class for thumbs-up feedback button.
 */
export function getThumbsUpClass(msg: { feedback?: string }): string {
  return msg.feedback === "Approved"
    ? "bot-action-btn thumbs-up-active"
    : "bot-action-btn";
}

/**
 * CSS class for thumbs-down feedback button.
 */
export function getThumbsDownClass(msg: { feedback?: string }): string {
  return msg.feedback === "Rejected"
    ? "bot-action-btn thumbs-down-active"
    : "bot-action-btn";
}
