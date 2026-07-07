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



export type PersonaGroup =

  | "teacher"

  | "student"

  | "management"

  | "principal"

  | "admin"

  | "hr";



export const SUGGESTED_PROMPTS_BY_PERSONA: Record<PersonaGroup, string[]> = {

  teacher: [

    "Show my profile summary",

    "Show my attendance for the last 7 days",

    "What is my attendance this month?",

    "What are the school holidays this month?",

    "Show names of all class teachers",

    "When did I join this school?",

  ],

  student: [

    "Show my profile summary",

    "What is my attendance this month?",

    "What are the school holidays this month?",

    "Show my class timetable",

    "What homework is due this week?",

    "Who is my class teacher?",

  ],

  management: [

    "Outstanding fee pending across the school",

    "projected cash flow for the next 90 days",

    "Current strength compare to our sanctioned capacity",

    "Show fee collection summary this month",
  ],

  principal: [

    "Show school-wide attendance today",

    "List teachers absent today",

    "Show fee collection summary this month",

    "Show top performing classes this term",

    "List pending leave approvals",

    "Show new admissions this month",

  ],

  admin: [

    "Show total student count",

    "List staff on leave today",

    "What are the school holidays this month?",

    "Show class-wise student strength",

    "List pending admission applications",

    "Show employee count by department",

  ],

  hr: [

    "Show my profile summary",

    "List employees on leave today",

    "Show staff joining this month",

    "List pending leave approvals",

    "Show employee count by department",

    "When did I join this school?",

  ],

};



/** @deprecated Use getSuggestedPrompts(roles) from utils/resolvePersona */

export const SUGGESTED_PROMPTS = SUGGESTED_PROMPTS_BY_PERSONA.teacher;



export type ChatbotScreen = "home" | "chat" | "voice";

