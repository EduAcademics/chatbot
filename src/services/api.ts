import { API_BASE_URL } from '../config/api';

// Types
export interface LoginCredentials {
  email: string;
  // password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

interface UserFetchRequest {
  email: string;
}

interface UserFetchResponse {
  status: string;
  user_id?: string;
  user_roles?: string;
  session_id?: string;
  message?: string;
}

interface QueryHandlerRequest {
  user_id: string;
  user_roles: string;
  query: string;
}

interface QueryHandlerResponse {
  status: string;
  data?: {
    answer: string;
    references: any[];
    mongodbquery: string[];
  };
  message?: string;
}

interface ChatRequest {
  session_id: string;
  query: string;
}

interface ChatResponse {
  status: string;
  data?: {
    answer?: string;
    class_info?: any;
    attendance_summary?: any[];
    message?: string;
    voice_processed?: boolean;
    references?: any[];
    mongodbquery?: string[];
    bulkattandance?: boolean;
    finish_collecting?: boolean;
  };
  message?: string;
}

interface UploadFileRequest {
  file: File;
  session_id: string;
}

interface ProcessAttendanceImageRequest {
  file: File;
  session_id: string;
  class_: string;
  section: string;
  date: string;
}

interface ProcessAttendanceImageResponse {
  status: string;
  data?: {
    message: string;
    attendance_summary: any[];
    class_info: any;
    ocr_text?: string;
    bulkattandance?: boolean;
    finish_collecting?: boolean;
  };
  message?: string;
}

interface ProcessVoiceClassInfoRequest {
  session_id: string;
  voice_text: string;
}

interface ProcessVoiceClassInfoResponse {
  status: string;
  data?: {
    class_info: any;
    message: string;
  };
  message?: string;
}

interface ProcessVoiceAttendanceRequest {
  session_id: string;
  voice_text: string;
  class_info: any;
}

interface ProcessVoiceAttendanceResponse {
  status: string;
  data?: {
    answer: string;
    attendance_summary: any[];
    class_info: any;
    voice_processed: boolean;
  };
  message?: string;
}

interface LeaveChatRequest {
  session_id: string;
  user_id?: string;  // Optional: user ID (will be mapped to employee UUID)
  query: string;
  bearer_token?: string;  // Optional: Bearer token for ERP API
  academic_session?: string;  // Optional: Academic session
  branch_token?: string;  // Optional: Branch token
}

interface LeaveChatResponse {
  status: string;
  data?: {
    answer?: string;
    leave_data?: {
      employee: string;
      start_date: string;
      end_date: string;
      leave_for: string;
      leave_type: string;
      description: string;
      reject_reason: string;
      attachments: any[];
      status: string;
      alternative_transport_incharges: any[];
    };
  };
  message?: string;
}

interface AssignmentChatRequest {
  session_id: string;
  user_id?: string;  // Optional: user ID (will be mapped to employee UUID)
  query: string;
  bearer_token?: string;  // Optional: Bearer token for ERP API
  academic_session?: string;  // Optional: Academic session
  branch_token?: string;  // Optional: Branch token
}

interface AssignmentChatResponse {
  status: string;
  data?: {
    answer?: string;
    assignment_data?: {
      title: string;
      classSection: string;
      subject: string;
      assignmentType: string;
      dueDate: string;
      description: string;
      attachments: any[];
    };
  };
  message?: string;
}

interface LeaveApprovalRequest {
  user_id: string;
  page?: number;
  limit?: number;
  bearer_token?: string;
  academic_session?: string;
  branch_token?: string;
}

interface LeaveApprovalResponse {
  message: string;
  status: number;
  data: {
    leaveRequests: Array<{
      uuid: string;
      employee: {
        personalInfo: {
          employeeName: string;
          employeeId: string;
          photoDocument?: {
            path: string;
          };
        };
      };
      start_date: string;
      end_date: string;
      leave_for: string;
      leave_type: {
        name: string;
      };
      description: string;
      status: string;
      created_at: string;
    }>;
    meta: {
      currentPage: number;
      limit: number;
      totalPages: number;
      totalRecords: number;
    };
  };
}

interface ApproveLeaveRequest {
  leave_request_uuid: string;
  bearer_token?: string;
  academic_session?: string;
  branch_token?: string;
}

interface RejectLeaveRequest {
  leave_request_uuid: string;
  reject_reason: string;
  bearer_token?: string;
  academic_session?: string;
  branch_token?: string;
}

interface TextToSpeechRequest {
  text: string;
}

interface FeedbackRequest {
  message_index: number;
  feedback: 'Approved' | 'Rejected';
  comment?: string;
}

interface FeedbackResponse {
  message: string;
}

// Helper function to get auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem('token');
};

// Helper function to get default headers
const getDefaultHeaders = (includeAuth: boolean = false): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (includeAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
};


 export const getAIHeaders = (): HeadersInit => {
  const headers = getDefaultHeaders(true) as Record<string, string>;

  const academicSession =
    localStorage.getItem('academic_session') || '2025-26';
  const branchToken = localStorage.getItem('branch_token') || 'indp';

  headers['x-academic-session'] = academicSession;
  headers['x-branch-token'] = branchToken;

  return headers;
};

// Auth API
export const authAPI = {
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const response = await fetch(`${API_BASE_URL}/v1/auth/login`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify(credentials),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    return data;
  },
};

// User API
export const userAPI = {
  fetch: async (request: UserFetchRequest): Promise<UserFetchResponse> => {
    const response = await fetch(`${API_BASE_URL}/v1/user/fetch`, {
      method: 'POST',
      headers: getDefaultHeaders(true),
      body: JSON.stringify(request),
    });

    return await response.json();
  },
};

// AI API
export const aiAPI = {
  // Query handler
  queryHandler: async (request: QueryHandlerRequest): Promise<QueryHandlerResponse> => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/query-handler`, {
      method: 'POST',
      headers: getAIHeaders(),
      body: JSON.stringify(request),
    });

    return await response.json();
  },

  // Chat endpoint (used for multiple purposes)
  chat: async (request: ChatRequest): Promise<ChatResponse> => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/chat`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify(request),
    });

    return await response.json();
  },

  // Upload regular file
  uploadFile: async (request: UploadFileRequest): Promise<any> => {
    const formData = new FormData();
    formData.append('file', request.file);
    formData.append('session_id', request.session_id);

    const response = await fetch(`${API_BASE_URL}/v1/ai/upload-file`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    return await response.json();
  },

  // Process attendance image
  processAttendanceImage: async (
    request: ProcessAttendanceImageRequest
  ): Promise<ProcessAttendanceImageResponse> => {
    const formData = new FormData();
    formData.append('file', request.file);
    formData.append('session_id', request.session_id);
    formData.append('class_', request.class_);
    formData.append('section', request.section);
    formData.append('date', request.date);

    const response = await fetch(`${API_BASE_URL}/v1/ai/process-attendance-image`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Image processing failed');
    }

    return await response.json();
  },

  // Process voice class info
  processVoiceClassInfo: async (
    request: ProcessVoiceClassInfoRequest
  ): Promise<ProcessVoiceClassInfoResponse> => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/process-voice-class-info`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify(request),
    });

    return await response.json();
  },

  // Process voice attendance
  processVoiceAttendance: async (
    request: ProcessVoiceAttendanceRequest
  ): Promise<ProcessVoiceAttendanceResponse> => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/process-voice-attendance`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify(request),
    });

    return await response.json();
  },

  // Start full voice attendance flow
  startFullVoiceAttendance: async (
    request: { session_id: string }
  ): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/start-full-voice-attendance`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify(request),
    });

    return await response.json();
  },

  // Process full voice attendance input
  processFullVoiceAttendance: async (
    request: { session_id: string; voice_text: string }
  ): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/process-full-voice-attendance`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify(request),
    });

    return await response.json();
  },

  // Text to speech
  textToSpeech: async (request: TextToSpeechRequest): Promise<ReadableStreamDefaultReader<Uint8Array> | null> => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/text-to-speech`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error('TTS failed');
    }

    return response.body?.getReader() || null;
  },

  // Feedback
  feedback: async (request: FeedbackRequest): Promise<FeedbackResponse> => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/feedback`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify(request),
    });

    return await response.json();
  },

  // Leave chat
  leaveChat: async (request: LeaveChatRequest): Promise<LeaveChatResponse> => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/leave-chat`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify(request),
    });

    return await response.json();
  },

  // Assignment chat
  assignmentChat: async (request: AssignmentChatRequest): Promise<AssignmentChatResponse> => {
    const response = await fetch(`${API_BASE_URL}/v1/ai/assignment-chat`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify(request),
    });

    return await response.json();
  },

  // Upload assignment file
  uploadAssignmentFile: async (file: File, session_id: string): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', session_id);

    const response = await fetch(`${API_BASE_URL}/v1/ai/upload-assignment-file`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Assignment file upload failed');
    }

    return await response.json();
  },
};

// Leave Approval API
export const leaveApprovalAPI = {
  // Fetch pending leave requests for approval
  fetchPendingRequests: async (request: LeaveApprovalRequest): Promise<LeaveApprovalResponse> => {
    const params = new URLSearchParams({
      user_id: request.user_id,
      page: String(request.page || 1),
      limit: String(request.limit || 10),
    });

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (request.bearer_token) {
      headers['Authorization'] = `Bearer ${request.bearer_token}`;
    }
    if (request.academic_session) {
      headers['x-academic-session'] = request.academic_session;
    }
    if (request.branch_token) {
      headers['x-branch-token'] = request.branch_token;
    }

    const response = await fetch(
      `${API_BASE_URL}/v1/ai/leave-approval-requests?${params.toString()}`,
      {
        method: 'GET',
        headers,
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch leave approval requests');
    }

    return await response.json();
  },

  // Approve a leave request
  approve: async (request: ApproveLeaveRequest): Promise<any> => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (request.bearer_token) {
      headers['Authorization'] = `Bearer ${request.bearer_token}`;
    }
    if (request.academic_session) {
      headers['x-academic-session'] = request.academic_session;
    }
    if (request.branch_token) {
      headers['x-branch-token'] = request.branch_token;
    }

    const response = await fetch(`${API_BASE_URL}/v1/ai/leave-approval/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        leave_request_uuid: request.leave_request_uuid,
        bearer_token: request.bearer_token,
        academic_session: request.academic_session,
        branch_token: request.branch_token,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to approve leave request');
    }

    return await response.json();
  },

  // Reject a leave request
  reject: async (request: RejectLeaveRequest): Promise<any> => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (request.bearer_token) {
      headers['Authorization'] = `Bearer ${request.bearer_token}`;
    }
    if (request.academic_session) {
      headers['x-academic-session'] = request.academic_session;
    }
    if (request.branch_token) {
      headers['x-branch-token'] = request.branch_token;
    }

    const response = await fetch(`${API_BASE_URL}/v1/ai/leave-approval/reject`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        leave_request_uuid: request.leave_request_uuid,
        reject_reason: request.reject_reason,
        bearer_token: request.bearer_token,
        academic_session: request.academic_session,
        branch_token: request.branch_token,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to reject leave request');
    }

    return await response.json();
  },
};

// Course Progress API
const ERP_API_BASE_URL = 'https://api.eduacademics.com';

interface ClassSectionOption {
  _id: string;
  classId: string;
  sectionId: string;
  className?: string;
  sectionName?: string;
  class?: {
    name: string;
    _id: string;
  };
  section?: {
    name: string;
    _id: string;
  };
}

interface FetchClassSectionsRequest {
  page?: number;
  limit?: number;
  bearer_token?: string;
  academic_session?: string;
  branch_token?: string;
}

interface FetchClassSectionsResponse {
  message?: string;
  status: number | string;
  data?: {
    options: Array<{
      class: {
        _id: string;
        name: string;
        uuid: string;
      };
      section: {
        _id: string;
        name: string;
        uuid: string;
      };
      isClassTeacher?: boolean;
    }>;
  };
}

interface GetCourseProgressRequest {
  classId: string;
  sectionId: string;
  bearer_token?: string;
  academic_session?: string;
  branch_token?: string;
}

interface GetCourseProgressResponse {
  status: string;
  data?: {
    progress: any;
    classId: string;
    sectionId: string;
    className?: string;
    sectionName?: string;
  };
  message?: string;
}

export const courseProgressAPI = {
  // Fetch class and section options
  fetchClassSections: async (request: FetchClassSectionsRequest): Promise<FetchClassSectionsResponse> => {
    const params = new URLSearchParams({
      page: String(request.page || 1),
      limit: String(request.limit || 20),
    });

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (request.bearer_token) {
      headers['Authorization'] = `Bearer ${request.bearer_token}`;
    }
    if (request.academic_session) {
      headers['x-academic-session'] = request.academic_session;
    }
    if (request.branch_token) {
      headers['x-branch-token'] = request.branch_token;
    }

    const response = await fetch(
      `${ERP_API_BASE_URL}/v1/list-options/my-class-sections?${params.toString()}`,
      {
        method: 'GET',
        headers,
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch class sections');
    }

    return await response.json();
  },

  // Get course progress for a class and section
  getProgress: async (request: GetCourseProgressRequest): Promise<GetCourseProgressResponse> => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (request.bearer_token) {
      headers['Authorization'] = `Bearer ${request.bearer_token}`;
    }
    if (request.academic_session) {
      headers['x-academic-session'] = request.academic_session;
    }
    if (request.branch_token) {
      headers['x-branch-token'] = request.branch_token;
    }

    const response = await fetch(
      `${ERP_API_BASE_URL}/v1/teacher-diary/get-progress/${request.classId}/${request.sectionId}`,
      {
        method: 'GET',
        headers,
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch course progress');
    }

    return await response.json();
  },
};

