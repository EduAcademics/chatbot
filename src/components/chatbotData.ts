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
  "What are my classes today?",
  "Summarize my homework",
  "Help me with math problems",
  "What's on the school calendar?",
  "Explain photosynthesis simply",
  "Tips for better study habits",
];

export type ChatbotScreen = "home" | "chat" | "voice";
