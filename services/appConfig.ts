/**
 * Centralized configuration for application-wide constants.
 */
export const APP_VERSION = 'MK-Anti-Captcha.v2';

/**
 * Get Bot Admin API base URL
 * Returns production URL for app.monoklix.com, dev URL for dev.monoklix.com, localhost for development
 */
export const getBotAdminApiUrl = (): string => {
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        
        // Production and Development - use HTTPS subdomain via Cloudflare Tunnel
        if (hostname === 'app.monoklix.com' || hostname === 'dev.monoklix.com') {
            return 'https://api.monoklix.com';
        }
        
        // Local development
        return 'http://localhost:1247';
    }
    
    // Fallback
    return 'http://localhost:1247';
};

/**
 * Get Bot Admin API URL with auto-detection and fallback
 * - app.monoklix.com / dev.monoklix.com → use HTTPS subdomain via Cloudflare Tunnel
 * - localhost → directly use localhost:1247 (no testing needed)
 */
export const getBotAdminApiUrlWithFallback = async (): Promise<string> => {
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        
        // Production and Development - use HTTPS subdomain via Cloudflare Tunnel
        if (hostname === 'app.monoklix.com' || hostname === 'dev.monoklix.com') {
            return 'https://api.monoklix.com';
        }
        
        // Localhost - directly use localhost:1247 (no testing needed)
        // Both website and API are on same machine
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:1247';
        }
        
        // For other cases, use localhost as default
        return 'http://localhost:1247';
    }
    
    // Fallback
    return 'http://localhost:1247';
};

export const BOT_ADMIN_API_URL = getBotAdminApiUrl();
