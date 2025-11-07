// Re-export from centralized API service
export { authAPI as loginAPI } from './api';
export type { LoginCredentials, LoginResponse } from './api';

// Keep the login function for backward compatibility
import { authAPI } from './api';
export const login = authAPI.login;
