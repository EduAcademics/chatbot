import { API_BASE_URL } from '../config/api';

// Types
export interface LoginCredentials {
  email: string;
  password: string;
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
      headers: {
        'x-academic-session': '2025-26',
        'x-branch-token': 'indp',
        Authorization: 'Bearer <your-token>',
        'Content-Type': 'application/json',
      },
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
};

