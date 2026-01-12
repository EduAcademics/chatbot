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
  SUCCESS: "Your leave application has been submitted successfully.",

  /** Generic error message */
  ERROR_GENERIC: "An error occurred. Please try again.",

  /** Cancelled message */
  CANCELLED: "Leave application cancelled.",

  /** Voice mode ended */
  VOICE_MODE_ENDED: "Voice mode ended. Returning to normal chat.",
};

/**
 * Helper function to determine which message to speak based on bot response.
 * @param botText The bot's response text
 * @returns The appropriate voice message or null if nothing should be spoken
 */
export function getVoiceMessageForResponse(botText: string): string | null {
  // Check for initial activation
  if (botText.includes("Leave Application Flow Activated")) {
    return VOICE_MESSAGES.ACTIVATION + " " + VOICE_MESSAGES.INITIAL_PROMPT;
  }

  // Check for leave type request
  if (botText.includes("Please provide the leave type")) {
    return VOICE_MESSAGES.REQUEST_LEAVE_TYPE;
  }

  // Check for bus incharge selection
  if (botText.includes("Please select alternative Bus incharge")) {
    return VOICE_MESSAGES.REQUEST_INCHARGE;
  }

  // Check for approve/reject request
  if (botText.includes("type 'approve'") || botText.includes("type 'reject'")) {
    return VOICE_MESSAGES.REQUEST_APPROVAL;
  }

  // Check for success
  if (botText.includes("✅") && botText.includes("successfully")) {
    return VOICE_MESSAGES.SUCCESS;
  }

  // Check for errors
  if (botText.includes("❌") || botText.includes("error occurred")) {
    return VOICE_MESSAGES.ERROR_GENERIC;
  }

  // Don't speak for other messages (tables, detailed text, etc.)
  return null;
}
