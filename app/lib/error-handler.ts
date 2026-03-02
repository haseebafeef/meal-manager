import { logger } from './logger';
import { ActionResult } from './types';

/**
 * Standardized error handling for server actions
 */
export function handleActionError(error: unknown, context: string): ActionResult {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  
  logger.error(`[${context}]`, error);
  
  return { 
    success: false, 
    error: 'An error occurred. Please try again.' 
  };
}

/**
 * Validate and handle expected errors with user-friendly messages
 */
export function createErrorResponse(message: string): ActionResult {
  return { success: false, error: message };
}

/**
 * Create success response with optional data
 */
export function createSuccessResponse<T>(data?: T, message?: string): ActionResult<T> {
  return { success: true, data, message };
}
