
import { addLogEntry } from './aiLogService';
import { type User } from '../types';
import { supabase } from './supabaseClient';
import { PROXY_SERVER_URLS, getLocalhostServerUrl } from './serverConfig';
import { solveCaptcha } from './antiCaptchaService';
import { hasActiveTokenUltra, hasActiveTokenUltraWithRegistration, getMasterRecaptchaToken, updateUserProxyServer } from './userService';
import { isElectron, isLocalhost } from './environment';

export const getVeoProxyUrl = (): string => {
  const localhostUrl = getLocalhostServerUrl();
  
  // Electron: always localhost
  if (isElectron()) {
    return localhostUrl;
  }
  
  // Web: selection logic
  if (isLocalhost()) {
    const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
    // If user selected localhost or nothing selected, use localhost
    if (!userSelectedProxy || userSelectedProxy === localhostUrl) {
      return localhostUrl;
    }
    // If user explicitly selected a different server, respect that choice
    return userSelectedProxy;
  }
  
  // Not on localhost - use user selection or default
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
      return userSelectedProxy;
  }
  // Default if nothing selected - Use a known active server (s1)
  return 'https://s1.monoklix.com';
};

export const getImagenProxyUrl = (): string => {
  const localhostUrl = getLocalhostServerUrl();
  
  // Electron: always localhost
  if (isElectron()) {
    return localhostUrl;
  }
  
  // Web: selection logic (same as Veo)
  if (isLocalhost()) {
    const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
    if (!userSelectedProxy || userSelectedProxy === localhostUrl) {
      return localhostUrl;
    }
    return userSelectedProxy;
  }
  
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
      return userSelectedProxy;
  }
  return 'https://s1.monoklix.com';
};

export const getNanobanana2ProxyUrl = (): string => {
  const localhostUrl = getLocalhostServerUrl();
  
  // Electron: always localhost
  if (isElectron()) {
    return localhostUrl;
  }
  
  // Web: selection logic (same as Veo/Imagen)
  if (isLocalhost()) {
    const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
    if (!userSelectedProxy || userSelectedProxy === localhostUrl) {
      return localhostUrl;
    }
    return userSelectedProxy;
  }
  
  // Not on localhost - use user selection or default
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
    return userSelectedProxy;
  }
  return 'https://s1.monoklix.com';
};

const getPersonalTokenLocal = (): { token: string; createdAt: string; } | null => {
    try {
        const userJson = localStorage.getItem('currentUser');
        if (userJson) {
            const user = JSON.parse(userJson);
            if (user && user.personalAuthToken && typeof user.personalAuthToken === 'string' && user.personalAuthToken.trim().length > 0) {
                return { token: user.personalAuthToken, createdAt: 'personal' };
            }
        }
    } catch (e) {
        console.error("Could not parse user from localStorage to get personal token", e);
    }
    return null;
};

// Fallback: Fetch fresh token from DB if missing locally
const getFreshPersonalTokenFromDB = async (): Promise<string | null> => {
    try {
        const userJson = localStorage.getItem('currentUser');
        if (!userJson) {
            console.warn('[API Client] No currentUser in localStorage');
            return null;
        }
        
        const user = JSON.parse(userJson);
        if (!user || !user.id) {
            console.warn('[API Client] User object invalid or missing ID');
            return null;
        }

        // Removed sensitive data logging - user ID is sensitive
        // console.log(`[API Client] Fetching token for user ${user.id} from DB...`);
        const { data, error } = await supabase
            .from('users')
            .select('personal_auth_token')
            .eq('id', user.id)
            .single();
            
        if (error) {
            console.error('[API Client] Supabase error fetching token:', error);
            return null;
        }

        if (data && data.personal_auth_token) {
            // Update local storage to prevent future fetches
            const updatedUser = { ...user, personalAuthToken: data.personal_auth_token };
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            console.log('[API Client] Refreshed personal token from DB and updated localStorage.');
            return data.personal_auth_token;
        } else {
            console.warn('[API Client] DB query returned no token (null/empty).');
        }
    } catch (e) {
        console.error("[API Client] Exception refreshing token from DB", e);
    }
    return null;
};

const getCurrentUserInternal = (): User | null => {
    try {
        const savedUserJson = localStorage.getItem('currentUser');
        if (savedUserJson) {
            const user = JSON.parse(savedUserJson) as User;
            if (user && user.id) {
                return user;
            }
        }
    } catch (error) {
        console.error("Failed to parse user from localStorage for activity log.", error);
    }
    return null;
};

/**
 * Get reCAPTCHA token from anti-captcha.com if enabled
 * Returns null if anti-captcha is disabled or if there's an error
 * @param projectId - Optional project ID to use for captcha solving (must match request body)
 */
const getRecaptchaToken = async (projectId?: string, onStatusUpdate?: (status: string) => void): Promise<string | null> => {
    try {
        // Anti-captcha is always enabled
        const currentUser = getCurrentUserInternal();
        if (!currentUser) {
            console.error('[API Client] getRecaptchaToken: No current user found');
            return null;
        }

        // Default: Use personal token from users.recaptcha_token
        let apiKey = currentUser.recaptchaToken || '';

        // Check Token Ultra registration status
        // Try to get from cache first
        const cachedReg = sessionStorage.getItem(`token_ultra_registration_${currentUser.id}`);
        let tokenUltraReg: any = null;
        
        if (cachedReg) {
            try {
                tokenUltraReg = JSON.parse(cachedReg);
            } catch (e) {
                console.warn('[API Client] Failed to parse cached registration', e);
            }
        }

        // If not in cache, fetch from database
        if (!tokenUltraReg) {
            const ultraResult = await hasActiveTokenUltraWithRegistration(currentUser.id);
            if (ultraResult.isActive && ultraResult.registration) {
                tokenUltraReg = ultraResult.registration;
            }
        }

        // If Token Ultra is active, check allow_master_token from registration
        if (tokenUltraReg) {
            const expiresAt = new Date(tokenUltraReg.expires_at);
            const now = new Date();
            const isActive = tokenUltraReg.status === 'active' && expiresAt > now;

            if (isActive) {
                // Token Ultra is active - check allow_master_token from token_ultra_registrations
                // null/undefined = true (default), false = block master token
                const isBlockedFromMaster = tokenUltraReg.allow_master_token === false;

                if (!isBlockedFromMaster) {
                    // Token Ultra active + NOT blocked → Use master token
                    const cachedMasterToken = sessionStorage.getItem('master_recaptcha_token');
                    if (cachedMasterToken && cachedMasterToken.trim()) {
                        apiKey = cachedMasterToken;
                        console.log('[API Client] Using master recaptcha token (Token Ultra user)');
                    } else {
                        // Fallback: try to fetch if not cached
                        console.warn('[API Client] Master token not in cache, fetching...');
                        const masterTokenResult = await getMasterRecaptchaToken();
                        if (masterTokenResult.success && masterTokenResult.apiKey) {
                            apiKey = masterTokenResult.apiKey;
                            console.log('[API Client] Using master recaptcha token (Token Ultra user - fetched)');
                        } else {
                            console.warn('[API Client] Master token fetch failed, falling back to user token');
                            apiKey = currentUser.recaptchaToken || '';
                        }
                    }
                } else {
                    // Token Ultra active but BLOCKED from master token → Use personal token
                    apiKey = currentUser.recaptchaToken || '';
                    console.log('[API Client] Using personal recaptcha token (Token Ultra user - master token blocked)');
                }
            } else {
                // Token Ultra expired/inactive → Use personal token
                apiKey = currentUser.recaptchaToken || '';
                console.log('[API Client] Using user\'s own recaptcha token (Token Ultra expired)');
            }
        } else {
            // Normal User (no Token Ultra) → Use personal token
            if (apiKey) {
                console.log('[API Client] Using user\'s own recaptcha token (Normal User)');
            }
        }

        if (!apiKey.trim()) {
            console.error('[API Client] ❌ Anti-Captcha enabled but no API key configured', {
                hasTokenUltra: !!tokenUltraReg,
                hasUserToken: !!currentUser.recaptchaToken
            });
            return null;
        }

        // Use projectId from parameter (from request body), fallback to localStorage, then undefined (will auto-generate)
        const finalProjectId = projectId || localStorage.getItem('antiCaptchaProjectId') || undefined;

        if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA...');
        console.log('[API Client] Getting reCAPTCHA token from anti-captcha.com...', {
            apiKeyLength: apiKey.length,
            hasProjectId: !!finalProjectId
        });
        if (finalProjectId) {
            console.log(`[API Client] Using projectId: ${finalProjectId.substring(0, 8)}...`);
        }

        const token = await solveCaptcha({
            apiKey: apiKey.trim(),
            projectId: finalProjectId
        });

        if (token) {
            console.log('[API Client] ✅ reCAPTCHA token obtained, length:', token.length);
        } else {
            console.error('[API Client] ❌ solveCaptcha returned null/empty token');
        }
        return token;
    } catch (error) {
        console.error('[API Client] ❌ Failed to get reCAPTCHA token:', error);
        // Don't throw error, just return null and let request proceed without captcha token
        // Server might handle it differently
        return null;
    }
};

/**
 * Get reCAPTCHA token from anti-captcha.com - PERSONAL KEY ONLY
 * For NANOBANANA PRO: Only uses personal key, NEVER uses master key
 * Returns null if personal key is not configured
 * @param projectId - Optional project ID to use for captcha solving (must match request body)
 */
const getPersonalRecaptchaToken = async (projectId?: string, onStatusUpdate?: (status: string) => void): Promise<string | null> => {
    try {
        const currentUser = getCurrentUserInternal();
        if (!currentUser) {
            console.error('[API Client] getPersonalRecaptchaToken: No current user found');
            return null;
        }

        // NANOBANANA PRO: Force use personal key only - NEVER use master key
        const personalKey = currentUser.recaptchaToken || '';
        
        if (!personalKey.trim()) {
            console.error('[API Client] ❌ NANOBANANA PRO requires personal Anti-Captcha API key');
            if (onStatusUpdate) onStatusUpdate('Personal Anti-Captcha API key required');
            return null;
        }

        console.log('[API Client] Using personal Anti-Captcha API key for NANOBANANA PRO');

        // Use projectId from parameter (from request body), fallback to localStorage, then undefined (will auto-generate)
        const finalProjectId = projectId || localStorage.getItem('antiCaptchaProjectId') || undefined;

        if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA...');
        console.log('[API Client] Getting reCAPTCHA token from anti-captcha.com (personal key only)...', {
            apiKeyLength: personalKey.length,
            hasProjectId: !!finalProjectId
        });
        if (finalProjectId) {
            console.log(`[API Client] Using projectId: ${finalProjectId.substring(0, 8)}...`);
        }

        const token = await solveCaptcha({
            apiKey: personalKey.trim(),
            projectId: finalProjectId
        });

        if (token) {
            console.log('[API Client] ✅ reCAPTCHA token obtained (personal key), length:', token.length);
        } else {
            console.error('[API Client] ❌ solveCaptcha returned null/empty token');
        }
        return token;
    } catch (error) {
        console.error('[API Client] ❌ Failed to get reCAPTCHA token (personal key):', error);
        return null;
    }
};

// --- EXECUTE REQUEST (STRICT PERSONAL TOKEN ONLY) ---

export const executeProxiedRequest = async (
  relativePath: string,
  serviceType: 'veo' | 'imagen' | 'nanobanana',
  requestBody: any,
  logContext: string,
  specificToken?: string,
  onStatusUpdate?: (status: string) => void,
  overrideServerUrl?: string // New parameter to force a specific server
): Promise<{ data: any; successfulToken: string; successfulServerUrl: string }> => {
  const isStatusCheck = logContext === 'VEO STATUS';
  
  if (!isStatusCheck) {
      console.log(`[API Client] Starting process for: ${logContext}`);
  }
  
  // Use override URL if provided, otherwise default to standard proxy selection
  let currentServerUrl: string;
  if (overrideServerUrl) {
    currentServerUrl = overrideServerUrl;
  } else if (serviceType === 'veo') {
    currentServerUrl = getVeoProxyUrl();
  } else if (serviceType === 'imagen') {
    currentServerUrl = getImagenProxyUrl();
  } else if (serviceType === 'nanobanana') {
    currentServerUrl = getNanobanana2ProxyUrl();
  } else {
    throw new Error(`Unknown service type: ${serviceType}`);
  }
  
  // 1. Get reCAPTCHA token if needed (only for Veo and NANOBANANA 2 GENERATE requests and health checks, not for UPLOAD or Imagen)
  const isGenerationRequest = logContext.includes('GENERATE') || logContext.includes('RECIPE') || logContext.includes('UPLOAD') || logContext.includes('HEALTH CHECK');
  // For reCAPTCHA: only GENERATE and HEALTH CHECK for Veo and NANOBANANA 2 (exclude UPLOAD)
  const needsRecaptcha = (logContext.includes('GENERATE') || logContext.includes('HEALTH CHECK')) && (serviceType === 'veo' || serviceType === 'nanobanana');
  let recaptchaToken: string | null = null;

  // Only get reCAPTCHA token for Veo and NANOBANANA 2 GENERATE requests, not for UPLOAD or Imagen
  if (needsRecaptcha) {
    // Extract projectId from request body if exists (MUST match for Google API validation)
    // For NANOBANANA 2, projectId is in requests[0].clientContext.projectId
    const projectIdFromBody = requestBody.clientContext?.projectId || requestBody.requests?.[0]?.clientContext?.projectId;

    // NANOBANANA PRO: Use personal key only (bypass master key)
    if (serviceType === 'nanobanana') {
        recaptchaToken = await getPersonalRecaptchaToken(projectIdFromBody, onStatusUpdate);
    } else {
        // For Veo and other services, use normal getRecaptchaToken (can use master key if available)
        recaptchaToken = await getRecaptchaToken(projectIdFromBody, onStatusUpdate);
    }

    // Inject reCAPTCHA token into request body if available
    // Same for Veo and NANOBANANA 2 - only inject in top level clientContext
    if (recaptchaToken) {
      if (requestBody.clientContext) {
        requestBody.clientContext.recaptchaToken = recaptchaToken;
        requestBody.clientContext.sessionId = requestBody.clientContext.sessionId || `;${Date.now()}`;
      }
      console.log('[API Client] ✅ Injected reCAPTCHA token into request body');
    } else {
      console.error('[API Client] ❌ Failed to get reCAPTCHA token - request will proceed without token');
      // Request will still proceed, but Google API may reject it
    }
  }

  // 2. Acquire Server Slot (Rate Limiting at Server Level)
  if (isGenerationRequest) {
    if (onStatusUpdate) onStatusUpdate('Queueing...');
    try {
        await supabase.rpc('request_generation_slot', { cooldown_seconds: 10, server_url: currentServerUrl });
    } catch (slotError) {
        console.warn('Slot request failed, proceeding anyway:', slotError);
    }
    if (onStatusUpdate) onStatusUpdate('Processing...');
  }
  
  // 3. Resolve Token
  let finalToken = specificToken;
  let sourceLabel: 'Specific' | 'Personal' = 'Specific';

  if (!finalToken) {
      // Step A: Check Local Storage
      const personalLocal = getPersonalTokenLocal();
      if (personalLocal) {
          finalToken = personalLocal.token;
          sourceLabel = 'Personal';
      }

      // Step B: If local missing, check Database
      if (!finalToken) {
          const freshToken = await getFreshPersonalTokenFromDB();
          if (freshToken) {
              finalToken = freshToken;
              sourceLabel = 'Personal';
          }
      }
  }

  if (!finalToken) {
      console.error(`[API Client] Authentication failed. No token found in LocalStorage or DB.`);
      throw new Error(`Authentication failed: No Personal Token found. Please go to Settings > Token & API and set your token.`);
  }

  // 4. Log
  if (!isStatusCheck && sourceLabel === 'Personal') {
      // console.log(`[API Client] Using Personal Token: ...${finalToken.slice(-6)}`);
  }

  const currentUser = getCurrentUserInternal();

  // 4.5. Record server usage with timestamp (fire-and-forget, only for Web version and actual API calls)
  if (!isElectron() && currentUser && currentServerUrl && !isStatusCheck) {
    // Record the actual server being used (not hardcoded)
    updateUserProxyServer(currentUser.id, currentServerUrl).catch(err => {
      // Silently fail - don't block API calls for logging
      console.warn('Failed to record server usage:', err);
    });
  }

  // 5. Execute
  try {
      // Detect if running in Electron (desktop mode)
      // In Electron, always use absolute URL (file:// protocol doesn't support relative API paths)
      // In browser, use relative path to leverage Vite proxy during development
      const isLocalhostServer = currentServerUrl.includes('localhost:3001');
      const endpoint = (isElectron() || !isLocalhostServer)
          ? `${currentServerUrl}/api/${serviceType}${relativePath}`  // Use absolute URL for Electron or remote servers
          : `/api/${serviceType}${relativePath}`;  // Use proxy path for browser with localhost
      
      const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${finalToken}`,
              'x-user-username': currentUser?.username || 'unknown',
          },
          body: JSON.stringify(requestBody),
      });

      let data;
      const textResponse = await response.text();
      try {
          data = JSON.parse(textResponse);
      } catch {
          data = { error: { message: `Proxy returned non-JSON (${response.status}): ${textResponse.substring(0, 100)}` } };
      }

      if (!response.ok) {
          const status = response.status;
          let errorMessage = data.error?.message || data.message || `API call failed (${status})`;
          const lowerMsg = errorMessage.toLowerCase();

          // Check for hard errors
          if (status === 400 || lowerMsg.includes('safety') || lowerMsg.includes('blocked')) {
              console.warn(`[API Client] 🛑 Non-retriable error (${status}). Prompt issue.`);
              throw new Error(`[${status}] ${errorMessage}`);
          }
          
          throw new Error(errorMessage);
      }

      if (!isStatusCheck) {
          console.log(`✅ [API Client] Success using ${sourceLabel} token on ${currentServerUrl}`);
      }
      return { data, successfulToken: finalToken, successfulServerUrl: currentServerUrl };

  } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isSafetyError = errMsg.includes('[400]') || errMsg.toLowerCase().includes('safety') || errMsg.toLowerCase().includes('blocked');

      if (!specificToken && !isSafetyError && !isStatusCheck) {
          addLogEntry({ 
              model: logContext, 
              prompt: `Failed using ${sourceLabel} token`, 
              output: errMsg, 
              tokenCount: 0, 
              status: 'Error', 
              error: errMsg 
          });
      }
      throw error;
  }
};

