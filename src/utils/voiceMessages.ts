// src/utils/voiceMessages.ts

/**
 * Voice message templates for leave application voice flow.
 */
export const VOICE_MESSAGES = {
  /** Voice mode activation */
  ACTIVATION: "Leave application flow activated.",

  /** Initial prompt for leave application */
  INITIAL_PROMPT:
    "Available leave quota and past applied leaves are shown. To apply for leave, please provide the start date, end date, and leave type. For example, Casual Leave or Earned Leave.",

  /** Request for leave type */
  REQUEST_LEAVE_TYPE:
    "Please provide the leave type. For example, Casual Leave or Earned Leave.",

  /** Request for bus incharge selection */
  REQUEST_INCHARGE:
    "Please select an alternative bus in-charge from the list. You can select by typing the number or the name.",

  /** Request for approval/rejection */
  REQUEST_APPROVAL:
    "Please say approve to submit the leave application or reject to cancel.",

  /** Success message */
  SUCCESS: "Your leave request has been submitted for approval.",

  /** Generic error message */
  ERROR_GENERIC: "An error occurred. Please try again.",

  /** Cancelled message */
  CANCELLED: "Leave application cancelled.",

  /** Voice mode ended */
  VOICE_MODE_ENDED: "Voice mode ended. Returning to normal chat.",
};

function sanitizeForSpeech(text: string): string {
  if (!text) return "";
  let t = String(text);

  // Remove markdown emphasis and bullets
  t = t.replace(/\*\*/g, "");
  t = t.replace(/•/g, "");

  // Remove common UI emojis used in responses
  t = t.replace(/✅|📝|🗓️|🚀/g, "");

  // Slightly friendlier numeric prompts for speech
  t = t.replace(/Reply 1\/2\/3\./g, "Reply one, two, or three.");

  // Collapse whitespace
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/[ \t]{2,}/g, " ");
  return t.trim();
}

/**
 * Helper function to determine which message to speak based on bot response.
 * @param botText The bot's response text
 * @returns The appropriate voice message or null if nothing should be spoken
 */
export function getVoiceMessageForResponse(botText: string): string | null {
  const text = botText || "";

  // Check for initial activation
  if (text.includes("Leave Application Flow Activated")) {
    return VOICE_MESSAGES.ACTIVATION + " " + VOICE_MESSAGES.INITIAL_PROMPT;
  }

  // New interactive duration prompt
  if (text.includes("You want to apply Half Day, Full Day, or Long Leave?")) {
    return "You want to apply Half Day, Full Day, or Long Leave?";
  }

  // New interactive date prompt
  if (text.includes("Which date is the leave for?")) {
    return "Which date is the leave for?";
  }
  if (text.includes("Which date is the half-day leave for?")) {
    return "Which date is the half-day leave for?";
  }
  if (text.includes("Start date") || text.includes("End date")) {
    return sanitizeForSpeech(text);
  }

  // New leave type prompt
  if (
    text.includes("Leave type") ||
    text.includes("Choose one of these options")
  ) {
    return "Please select the leave type.";
  }

  // New alternative incharge prompt
  if (text.includes("Alternative incharge") || text.includes("bus incharge")) {
    return "Please select an alternative incharge from the list.";
  }

  // Reason prompt
  if (
    text.includes("What’s the reason for your leave?") ||
    text.includes("What's the reason for your leave?")
  ) {
    return "What’s the reason for your leave?";
  }

  // Summary prompt
  if (text.includes("Leave Summary") || text.includes("Submit this request?")) {
    return sanitizeForSpeech(text);
  }

  // Check for leave type request
  if (text.includes("Please provide the leave type")) {
    return VOICE_MESSAGES.REQUEST_LEAVE_TYPE;
  }

  // Check for bus incharge selection
  if (text.includes("Please select alternative Bus incharge")) {
    return VOICE_MESSAGES.REQUEST_INCHARGE;
  }

  // Check for approve/reject request
  if (text.includes("type 'approve'") || text.includes("type 'reject'")) {
    return VOICE_MESSAGES.REQUEST_APPROVAL;
  }

  // Check for success
  if (
    text.includes("✅") &&
    (text.toLowerCase().includes("submitted") ||
      text.toLowerCase().includes("request id"))
  ) {
    return VOICE_MESSAGES.SUCCESS;
  }

  // Check for errors
  if (
    text.toLowerCase().includes("couldn't submit") ||
    text.toLowerCase().includes("could not submit") ||
    text.toLowerCase().includes("error occurred") ||
    text.toLowerCase().includes("failed")
  ) {
    return VOICE_MESSAGES.ERROR_GENERIC;
  }

  // Fallback: speak the bot message (sanitized)
  const fallback = sanitizeForSpeech(text);
  return fallback || null;
}
