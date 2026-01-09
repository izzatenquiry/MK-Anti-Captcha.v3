/**
 * Centralized configuration for application-wide constants.
 * Unified version that works for both Electron and Web.
 */
import { isElectron } from './environment';

export const APP_VERSION = isElectron() 
  ? 'MK_Anti_Captcha_PC_V1' 
  : 'MK_Anti_Captcha_WEB_V1';

/**
 * Get Bot Admin API base URL
 * All environments use api.monoklix.com for centralized token generation
 */
export const getBotAdminApiUrl = (): string => {
  return 'https://api.monoklix.com';
};

/**
 * Get Bot Admin API URL with auto-detection
 * All environments use api.monoklix.com
 */
export const getBotAdminApiUrlWithFallback = async (): Promise<string> => {
  return 'https://api.monoklix.com';
};

export const BOT_ADMIN_API_URL = getBotAdminApiUrl();

