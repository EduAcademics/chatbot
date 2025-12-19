/**
 * chatRouter.ts
 * 
 * RESPONSIBILITY: Flow detection & routing
 * - classifyQuery logic
 * - confidence thresholds
 * - auto/manual routing
 * - stay-in-flow rules
 * - No React imports
 */

import { API_BASE_URL } from '../config/api';
import { getAIHeaders } from '../services/api';

export type FlowType =
  | 'none'
  | 'query'
  | 'attendance'
  | 'voice_attendance'
  | 'full_voice_attendance'
  | 'leave'
  | 'leave_approval'
  | 'assignment'
  | 'course_progress';

export interface ClassificationResult {
  flow: string;
  confidence: number;
  entities: any;
}

export interface RouterContext {
  activeFlow: FlowType;
  attendanceStep: 'class_info' | 'student_details' | 'completed';
  pendingClassInfo: any;
  userOptionSelected: boolean;
  autoRouting: boolean;
}

/**
 * Classify user query to determine appropriate flow
 */
export const classifyQuery = async (
  message: string,
  userId: string,
  roles: string
): Promise<ClassificationResult> => {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/ai/classify-query`, {
      method: 'POST',
      headers: getAIHeaders(),
      body: JSON.stringify({
        query: message,
        user_id: userId,
        user_roles: roles ? roles.split(',') : [],
      }),
    });

    const data = await response.json();

    if (data.status === 'success') {
      const { flow, confidence, entities } = data.data;

      console.log('🔍 Query Classification:', {
        query: message,
        detectedFlow: flow,
        confidence: `${(confidence * 100).toFixed(0)}%`,
        entities,
      });

      return { flow, confidence, entities };
    }

    // Fallback
    return { flow: 'query', confidence: 0.8, entities: {} };
  } catch (error) {
    console.error('❌ Classification error:', error);
    return { flow: 'query', confidence: 0.8, entities: {} };
  }
};

/**
 * Check if message is an exit command
 */
export const isExitCommand = (message: string): boolean => {
  const exitKeywords = ['exit', 'cancel', 'restart', 'quit', 'stop', 'done'];
  return exitKeywords.some((keyword) => message.toLowerCase().trim() === keyword);
};

/**
 * Check if message looks like a new flow request
 */
export const looksLikeNewRequest = (message: string): boolean => {
  const newFlowKeywords = [
    'mark attendance',
    'take attendance',
    'attendance for',
    'apply leave',
    'apply for leave',
    'need leave',
    'want leave',
    'create assignment',
    'give assignment',
    'new assignment',
    'show me',
    'list all',
    'show',
    'list',
    'course progress',
    'syllabus',
    'view',
    'display',
  ];
  return newFlowKeywords.some((keyword) => message.toLowerCase().includes(keyword));
};

/**
 * Check if message is a simple response (should stay in current flow)
 */
export const isSimpleResponse = (message: string): boolean => {
  const simpleResponses = [
    'yes',
    'no',
    'ok',
    'okay',
    'skip',
    'approve',
    'reject',
    'continue',
    'sick',
    'casual',
    'earned',
    'medical',
    'urgent',
    'personal',
    'maternity',
    'paternity',
    'today',
    'tomorrow',
    'yesterday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  return simpleResponses.includes(message.toLowerCase().trim());
};

/**
 * Determine if we should stay in current flow
 */
export const shouldStayInFlow = (
  context: RouterContext,
  userMessage: string
): boolean => {
  const { activeFlow, attendanceStep, pendingClassInfo } = context;

  // Check if we're in the middle of a multi-step attendance flow
  const inAttendanceFlow =
    activeFlow === 'attendance' &&
    attendanceStep === 'student_details' &&
    pendingClassInfo;
  const inVoiceAttendanceFlow =
    activeFlow === 'voice_attendance' &&
    attendanceStep === 'student_details' &&
    pendingClassInfo;

  // For leave/assignment, check if message looks like a NEW request
  const looksLikeNew = looksLikeNewRequest(userMessage);
  const inLeaveFlow = activeFlow === 'leave' && !looksLikeNew;
  const inAssignmentFlow = activeFlow === 'assignment' && !looksLikeNew;

  if (inAttendanceFlow || inVoiceAttendanceFlow || inLeaveFlow || inAssignmentFlow) {
    return true;
  }

  // Check for simple responses
  if (isSimpleResponse(userMessage) && activeFlow !== 'none' && activeFlow !== 'query') {
    return true;
  }

  // Short message in an active flow (likely a response to a question)
  if (
    activeFlow !== 'none' &&
    activeFlow !== 'query' &&
    userMessage.length < 50 &&
    !looksLikeNew
  ) {
    return true;
  }

  return false;
};

/**
 * Route message to appropriate flow
 */
export const routeMessage = async (
  userMessage: string,
  context: RouterContext,
  userId: string,
  roles: string
): Promise<{
  targetFlow: FlowType;
  classificationResult: ClassificationResult | null;
  shouldClassify: boolean;
}> => {
  const { activeFlow, autoRouting } = context;

  // Check for exit commands
  if (isExitCommand(userMessage) && activeFlow !== 'none' && activeFlow !== 'query') {
    return {
      targetFlow: 'none',
      classificationResult: null,
      shouldClassify: false,
    };
  }

  // If auto-routing is disabled, use current flow
  if (!autoRouting) {
    return {
      targetFlow: activeFlow,
      classificationResult: null,
      shouldClassify: false,
    };
  }

  // Check if we should stay in current flow
  if (shouldStayInFlow(context, userMessage)) {
    return {
      targetFlow: activeFlow,
      classificationResult: null,
      shouldClassify: false,
    };
  }

  // Run classification
  const classificationResult = await classifyQuery(userMessage, userId, roles);
  let targetFlow = classificationResult.flow as FlowType;

  // Map backend flow names to frontend flow types
  if (targetFlow === ('assignment_create' as any)) {
    targetFlow = 'assignment';
  } else if (targetFlow === ('assignment_submit' as any)) {
    targetFlow = 'assignment';
  }

  // Low confidence warning (but still proceed)
  if (classificationResult.confidence < 0.25) {
    console.warn('⚠️ Low classification confidence, defaulting to query');
    targetFlow = 'query';
  }

  return {
    targetFlow,
    classificationResult,
    shouldClassify: true,
  };
};

