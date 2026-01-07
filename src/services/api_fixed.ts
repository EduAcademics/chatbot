// Auth API
export const authAPI = {
  login: async (credentials) => {
    const response = await fetch(`${API_BASE_URL}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }
    return data;
  },
};
import { API_BASE_URL } from "../config/api";

// Assignment Status Endpoint Types
export interface AssignmentStatusRequest {
  session_id: string;
  user_id: string;
  query: string;
  bearer_token?: string;
  academic_session?: string;
  branch_token?: string;
}

export interface AssignmentStatusResponse {
  status: string;
  data?: {
    answer: string;
    references?: any;
    mongodbquery?: any;
  };
  message?: string;
}

// ... (all other type/interface definitions from previous code) ...

// Helper function to get auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem("token");
};

// Helper function to get default headers
const getDefaultHeaders = (includeAuth: boolean = false): HeadersInit => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (includeAuth) {
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  return headers;
};

export const getAIHeaders = (): HeadersInit => {
  const headers = getDefaultHeaders(true) as Record<string, string>;

  const academicSession = localStorage.getItem("academic_session") || "2025-26";
  const branchToken = localStorage.getItem("branch_token") || "indp";

  headers["x-academic-session"] = academicSession;
  headers["x-branch-token"] = branchToken;

  return headers;
};

// --- COPIED FROM api.ts ---
export const userAPI = {
  fetch: async (request) => {
    const response = await fetch(`${API_BASE_URL}/v1/user/fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(request),
    });
    return await response.json();
  },
};

export const aiAPI = {
  assignmentStatus: async (request) => {
    const headers = { "Content-Type": "application/json" };
    if (request.bearer_token)
      headers["Authorization"] = `Bearer ${request.bearer_token}`;
    if (request.academic_session)
      headers["x-academic-session"] = request.academic_session;
    if (request.branch_token) headers["x-branch-token"] = request.branch_token;
    const response = await fetch(`${API_BASE_URL}/v1/ai/assignment-status`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Failed to fetch assignment status");
    return await response.json();
  },
  queryHandler: async (request) => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/query-handler`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return await response.json();
  },
  chat: async (request) => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return await response.json();
  },
  uploadFile: async (request) => {
    const formData = new FormData();
    formData.append("file", request.file);
    formData.append("session_id", request.session_id);
    const response = await fetch(`${API_BASE_URL}/v1/ai/upload-file`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error("Upload failed");
    return await response.json();
  },
  processAttendanceImage: async (request) => {
    const formData = new FormData();
    formData.append("file", request.file);
    formData.append("session_id", request.session_id);
    formData.append("class_", request.class_);
    formData.append("section", request.section);
    formData.append("date", request.date);
    const response = await fetch(
      `${API_BASE_URL}/v1/ai/process-attendance-image`,
      { method: "POST", body: formData }
    );
    if (!response.ok) throw new Error("Image processing failed");
    return await response.json();
  },
  processVoiceClassInfo: async (request) => {
    const response = await fetch(
      `${API_BASE_URL}/v1/ai/process-voice-class-info`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }
    );
    return await response.json();
  },
  processVoiceAttendance: async (request) => {
    const response = await fetch(
      `${API_BASE_URL}/v1/ai/process-voice-attendance`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }
    );
    return await response.json();
  },
  startFullVoiceAttendance: async (request) => {
    const response = await fetch(
      `${API_BASE_URL}/v1/ai/start-full-voice-attendance`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }
    );
    return await response.json();
  },
  processFullVoiceAttendance: async (request) => {
    const response = await fetch(
      `${API_BASE_URL}/v1/ai/process-full-voice-attendance`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }
    );
    return await response.json();
  },
  textToSpeech: async (request) => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/text-to-speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("TTS failed");
    return response.body?.getReader() || null;
  },
  feedback: async (request) => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return await response.json();
  },
  leaveChat: async (request) => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/leave-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return await response.json();
  },
  assignmentChat: async (request) => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/assignment-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return await response.json();
  },
  uploadAssignmentFile: async (file, session_id) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("session_id", session_id);
    const response = await fetch(
      `${API_BASE_URL}/v1/ai/upload-assignment-file`,
      { method: "POST", body: formData }
    );
    if (!response.ok) throw new Error("Assignment file upload failed");
    return await response.json();
  },
};

export const leaveApprovalAPI = {
  fetchPendingRequests: async (request) => {
    const params = new URLSearchParams({
      user_id: request.user_id,
      page: String(request.page || 1),
      limit: String(request.limit || 10),
    });
    const headers = { "Content-Type": "application/json" };
    if (request.bearer_token)
      headers["Authorization"] = `Bearer ${request.bearer_token}`;
    if (request.academic_session)
      headers["x-academic-session"] = request.academic_session;
    if (request.branch_token) headers["x-branch-token"] = request.branch_token;
    const response = await fetch(
      `${API_BASE_URL}/v1/ai/leave-approval-requests?${params.toString()}`,
      { method: "GET", headers }
    );
    if (!response.ok)
      throw new Error("Failed to fetch leave approval requests");
    return await response.json();
  },
  approve: async (request) => {
    const headers = { "Content-Type": "application/json" };
    if (request.bearer_token)
      headers["Authorization"] = `Bearer ${request.bearer_token}`;
    if (request.academic_session)
      headers["x-academic-session"] = request.academic_session;
    if (request.branch_token) headers["x-branch-token"] = request.branch_token;
    const response = await fetch(
      `${API_BASE_URL}/v1/ai/leave-approval/approve`,
      { method: "POST", headers, body: JSON.stringify(request) }
    );
    if (!response.ok) throw new Error("Failed to approve leave request");
    return await response.json();
  },
  reject: async (request) => {
    const headers = { "Content-Type": "application/json" };
    if (request.bearer_token)
      headers["Authorization"] = `Bearer ${request.bearer_token}`;
    if (request.academic_session)
      headers["x-academic-session"] = request.academic_session;
    if (request.branch_token) headers["x-branch-token"] = request.branch_token;
    const response = await fetch(
      `${API_BASE_URL}/v1/ai/leave-approval/reject`,
      { method: "POST", headers, body: JSON.stringify(request) }
    );
    if (!response.ok) throw new Error("Failed to reject leave request");
    return await response.json();
  },
};

const ERP_API_BASE_URL = "https://api.eduacademics.com";
export const courseProgressAPI = {
  fetchClassSections: async (request) => {
    const params = new URLSearchParams({
      page: String(request.page || 1),
      limit: String(request.limit || 20),
    });
    const headers = { "Content-Type": "application/json" };
    if (request.bearer_token)
      headers["Authorization"] = `Bearer ${request.bearer_token}`;
    if (request.academic_session)
      headers["x-academic-session"] = request.academic_session;
    if (request.branch_token) headers["x-branch-token"] = request.branch_token;
    const response = await fetch(
      `${ERP_API_BASE_URL}/v1/list-options/my-class-sections?${params.toString()}`,
      { method: "GET", headers }
    );
    if (!response.ok) throw new Error("Failed to fetch class sections");
    return await response.json();
  },
  getProgress: async (request) => {
    const headers = { "Content-Type": "application/json" };
    if (request.bearer_token)
      headers["Authorization"] = `Bearer ${request.bearer_token}`;
    if (request.academic_session)
      headers["x-academic-session"] = request.academic_session;
    if (request.branch_token) headers["x-branch-token"] = request.branch_token;
    const response = await fetch(
      `${ERP_API_BASE_URL}/v1/teacher-diary/get-progress/${request.classId}/${request.sectionId}`,
      { method: "GET", headers }
    );
    if (!response.ok) throw new Error("Failed to fetch course progress");
    return await response.json();
  },
};
