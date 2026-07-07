export const QUICK_ACTIONS = [
  {
    id: "voice",
    icon: "mic" as const,
    label: "Voice Chat AI",
    description: "Hold mic and speak naturally",
    screen: "voice" as const,
  },
  {
    id: "chat",
    icon: "chat" as const,
    label: "Chat with AI",
    description: "Type or tap suggestions",
    screen: "chat" as const,
  },
];

export const SUGGESTED_PROMPTS = [
  "Show my profile summary",
  "Show my attendance for the last 7 days",
  "What is my attendance this month?",
  "What are the school holidays this month?",
  "Show names of all class teachers",
  "When did I join this school?"
];

export type ChatbotScreen = "home" | "chat" | "voice";
