
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { saveUserPersonalAuthToken, saveUserRecaptchaToken, hasActiveTokenUltra, hasActiveTokenUltraWithRegistration, getMasterRecaptchaToken, getTokenUltraRegistration, getEmailFromPoolByCode, getUserProfile } from '../services/userService';
import { type User, type TokenUltraRegistration } from '../types';
import { KeyIcon, CheckCircleIcon, XIcon, AlertTriangleIcon, InformationCircleIcon, EyeIcon, EyeOffIcon, SparklesIcon, ClipboardIcon, ServerIcon, UserIcon, ClockIcon, VideoIcon, PlayIcon } from './Icons';
import Spinner from './common/Spinner';
import { getTranslations } from '../services/translations';
import { runComprehensiveTokenTest, type TokenTestResult } from '../services/imagenV3Service';
import { testAntiCaptchaKey } from '../services/antiCaptchaService';
import eventBus from '../services/eventBus';
import { BOT_ADMIN_API_URL, getBotAdminApiUrlWithFallback } from '../services/appConfig';

interface FlowLoginProps {
    currentUser?: User | null;
    onUserUpdate?: (user: User) => void;
    onOpenChangeServerModal?: () => void;
}

const FlowLogin: React.FC<FlowLoginProps> = ({ currentUser, onUserUpdate, onOpenChangeServerModal }) => {
    const [flowToken, setFlowToken] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing'>('idle');
    const [testResults, setTestResults] = useState<TokenTestResult[] | null>(null);
    const [tokenSaved, setTokenSaved] = useState(false);
    
    const saveTimeoutRef = useRef<any>(null);
    const recaptchaSaveTimeoutRef = useRef<any>(null);
    const isInitialMount = useRef(true);
    const T = getTranslations().settingsView;
    const T_Api = T.api;

    // Shared API Key State
    const [activeApiKey, setActiveApiKey] = useState<string | null>(null);

    // Anti-Captcha State
    const [antiCaptchaApiKey, setAntiCaptchaApiKey] = useState('');
    const [antiCaptchaProjectId, setAntiCaptchaProjectId] = useState(() => {
        return localStorage.getItem('antiCaptchaProjectId') || '';
    });
    const [showAntiCaptchaKey, setShowAntiCaptchaKey] = useState(false);
    const [antiCaptchaTestStatus, setAntiCaptchaTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [antiCaptchaTestMessage, setAntiCaptchaTestMessage] = useState<string>('');
    const [recaptchaTokenSaved, setRecaptchaTokenSaved] = useState(false);
    const [isSavingRecaptcha, setIsSavingRecaptcha] = useState(false);
    
    // Token Ultra Credentials State
    const [tokenUltraRegistration, setTokenUltraRegistration] = useState<TokenUltraRegistration | null>(null);
    const [emailDetails, setEmailDetails] = useState<{ email: string; password: string } | null>(null);
    const [showUltraPassword, setShowUltraPassword] = useState(false);
    const [copiedUltraEmail, setCopiedUltraEmail] = useState(false);
    const [copiedUltraPassword, setCopiedUltraPassword] = useState(false);
    
    // Token Ultra Status State
    const [ultraRegistration, setUltraRegistration] = useState<TokenUltraRegistration | null>(null);
    const [isLoadingUltra, setIsLoadingUltra] = useState(false);

    // Helper function to check if Token Ultra is active
    const isTokenUltraActive = useCallback((): boolean => {
        if (!ultraRegistration) return false;
        const expiresAt = new Date(ultraRegistration.expires_at);
        const now = new Date();
        return ultraRegistration.status === 'active' && expiresAt > now;
    }, [ultraRegistration]);
    
    // Server State
    const [currentServer, setCurrentServer] = useState<string | null>(null);
    
    // Video Tutorial Modal State
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    
    // Anti-Captcha Video Tutorial Modal State
    const [isAntiCaptchaVideoModalOpen, setIsAntiCaptchaVideoModalOpen] = useState(false);
    const antiCaptchaVideoRef = useRef<HTMLVideoElement>(null);
    
    // Generated Token from API State
    const [generatedToken, setGeneratedToken] = useState('');
    const [isLoadingToken, setIsLoadingToken] = useState(false);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [tokenCredits, setTokenCredits] = useState<number | null>(null);
    const [tokenCopied, setTokenCopied] = useState(false);
    const [generatedTokenSaved, setGeneratedTokenSaved] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const countdownIntervalRef = useRef<number | null>(null);
    
    const fetchCurrentServer = useCallback(() => {
        const server = sessionStorage.getItem('selectedProxyServer');
        setCurrentServer(server);
    }, []);

    useEffect(() => {
        fetchCurrentServer();
        setActiveApiKey(sessionStorage.getItem('monoklix_session_api_key'));
        
        const handleServerChanged = () => fetchCurrentServer();
        eventBus.on('serverChanged', handleServerChanged);
        
        return () => {
            eventBus.remove('serverChanged', handleServerChanged);
        };
    }, [fetchCurrentServer]);
    
    // Synchronize states with currentUser
    useEffect(() => {
        if (!currentUser) return;
        
        if (currentUser.personalAuthToken) {
            setFlowToken(currentUser.personalAuthToken);
        }
        
        const resolveAntiCaptchaKey = async () => {
            // Default: Use personal token
            let apiKey = currentUser.recaptchaToken || '';

            // Check Token Ultra registration status
            // Try to get from cache first
            const cachedReg = sessionStorage.getItem(`token_ultra_registration_${currentUser.id}`);
            let tokenUltraReg: any = null;
            
            if (cachedReg) {
                try {
                    tokenUltraReg = JSON.parse(cachedReg);
                } catch (e) {
                    console.warn('[FlowLogin] Failed to parse cached registration', e);
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
                        } else {
                            // Fallback: try to fetch if not cached
                            const masterTokenResult = await getMasterRecaptchaToken();
                            if (masterTokenResult.success && masterTokenResult.apiKey) {
                                apiKey = masterTokenResult.apiKey;
                            } else {
                                // Fallback to personal token
                                apiKey = currentUser.recaptchaToken || '';
                            }
                        }
                    } else {
                        // Token Ultra active but BLOCKED from master token → Use personal token
                        apiKey = currentUser.recaptchaToken || '';
                    }
                } else {
                    // Token Ultra expired/inactive → Use personal token
                    apiKey = currentUser.recaptchaToken || '';
                }
            } else {
                // Normal User (no Token Ultra) → Use personal token
                apiKey = currentUser.recaptchaToken || '';
            }

            setAntiCaptchaApiKey(apiKey);
        };
        
        resolveAntiCaptchaKey();
        
        // Load Token Ultra details and status
        const loadTokenUltraDetails = async () => {
            setIsLoadingUltra(true);
            try {
                const regResult = await getTokenUltraRegistration(currentUser.id);
                if (regResult.success && regResult.registration) {
                    setTokenUltraRegistration(regResult.registration);
                    setUltraRegistration(regResult.registration);
                    if (regResult.registration.email_code) {
                        const emailResult = await getEmailFromPoolByCode(regResult.registration.email_code);
                        if (emailResult.success) {
                            setEmailDetails({ email: emailResult.email, password: emailResult.password });
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to load ultra status", e);
            } finally {
                setIsLoadingUltra(false);
            }
        };
        loadTokenUltraDetails();
        
        if (isInitialMount.current) isInitialMount.current = false;
    }, [currentUser?.personalAuthToken, currentUser?.recaptchaToken, currentUser?.id]);

    // Auto-save Flow Token
    useEffect(() => {
        if (isInitialMount.current || !currentUser || !flowToken.trim() || flowToken.trim() === currentUser?.personalAuthToken) {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            return;
        }

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            try {
                setIsSaving(true);
                const result = await saveUserPersonalAuthToken(currentUser.id, flowToken.trim());
                if (result.success) {
                    setTokenSaved(true);
                    if (onUserUpdate) onUserUpdate(result.user);
                    setTimeout(() => setTokenSaved(false), 3000);
                }
            } catch (err) {
                console.error("Auto-save Flow Token failed", err);
            } finally {
                setIsSaving(false);
            }
        }, 2000);

        return () => clearTimeout(saveTimeoutRef.current as any);
    }, [flowToken, currentUser, onUserUpdate]);

    // Auto-save Anti-Captcha Key
    useEffect(() => {
        if (isInitialMount.current || !currentUser || !antiCaptchaApiKey.trim()) return;

        // CRITICAL: Don't auto-save if Token Ultra active and NOT blocked (using master token)
        // User should not be able to edit master token
        const cachedReg = sessionStorage.getItem(`token_ultra_registration_${currentUser.id}`);
        let tokenUltraReg: any = null;
        
        if (cachedReg) {
            try {
                tokenUltraReg = JSON.parse(cachedReg);
            } catch (e) {
                console.warn('[FlowLogin] Failed to parse cached registration for auto-save check', e);
            }
        }

        if (tokenUltraReg) {
            const expiresAt = new Date(tokenUltraReg.expires_at);
            const now = new Date();
            const isActive = tokenUltraReg.status === 'active' && expiresAt > now;
            const isBlockedFromMaster = tokenUltraReg.allow_master_token === false;
            
            if (isActive && !isBlockedFromMaster) {
                // Using master token - don't auto-save user edits
                return;
            }
        }

        const isUnchanged = async () => {
            return antiCaptchaApiKey.trim() === (currentUser.recaptchaToken || '');
        };

        isUnchanged().then(unchanged => {
            if (unchanged) return;

            if (recaptchaSaveTimeoutRef.current) clearTimeout(recaptchaSaveTimeoutRef.current);

            recaptchaSaveTimeoutRef.current = setTimeout(async () => {
                try {
                    setIsSavingRecaptcha(true);
                    const result = await saveUserRecaptchaToken(currentUser.id, antiCaptchaApiKey.trim());
                    if (result.success) {
                        setRecaptchaTokenSaved(true);
                        if (onUserUpdate) onUserUpdate(result.user);
                        setTimeout(() => setRecaptchaTokenSaved(false), 3000);
                    }
                } catch (err) {
                    console.error("Auto-save Anti-Captcha failed", err);
                } finally {
                    setIsSavingRecaptcha(false);
                }
            }, 2000);
        });

        return () => clearTimeout(recaptchaSaveTimeoutRef.current as any);
    }, [antiCaptchaApiKey, currentUser, onUserUpdate]);

    useEffect(() => {
        localStorage.setItem('antiCaptchaProjectId', antiCaptchaProjectId);
    }, [antiCaptchaProjectId]);

    // Auto-play video when modal opens
    useEffect(() => {
        if (isVideoModalOpen && videoRef.current) {
            videoRef.current.play().catch(err => {
                console.error('Error auto-playing video:', err);
            });
        }
    }, [isVideoModalOpen]);

    // Auto-play Anti-Captcha video when modal opens
    useEffect(() => {
        if (isAntiCaptchaVideoModalOpen && antiCaptchaVideoRef.current) {
            antiCaptchaVideoRef.current.play().catch(err => {
                console.error('Error auto-playing Anti-Captcha video:', err);
            });
        }
    }, [isAntiCaptchaVideoModalOpen]);

    // Cleanup countdown interval on unmount
    useEffect(() => {
        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, []);

    const handleTestAntiCaptcha = async () => {
        if (!antiCaptchaApiKey.trim()) return;
        setAntiCaptchaTestStatus('testing');
        setAntiCaptchaTestMessage('Testing API key...');
        try {
            const result = await testAntiCaptchaKey(antiCaptchaApiKey.trim());
            if (result.valid) {
                setAntiCaptchaTestStatus('success');
                setAntiCaptchaTestMessage('✅ API key is valid!');
            } else {
                setAntiCaptchaTestStatus('error');
                setAntiCaptchaTestMessage(`❌ ${result.error || 'Invalid API key'}`);
            }
        } catch (error) {
            setAntiCaptchaTestStatus('error');
            setAntiCaptchaTestMessage('❌ Test failed');
        }
        setTimeout(() => { setAntiCaptchaTestStatus('idle'); setAntiCaptchaTestMessage(''); }, 5000);
    };

    const handleCopyUltraEmail = () => {
        if (emailDetails?.email) {
            navigator.clipboard.writeText(emailDetails.email);
            setCopiedUltraEmail(true);
            setTimeout(() => setCopiedUltraEmail(false), 2000);
        }
    };

    const handleCopyUltraPassword = () => {
        if (emailDetails?.password) {
            navigator.clipboard.writeText(emailDetails.password);
            setCopiedUltraPassword(true);
            setTimeout(() => setCopiedUltraPassword(false), 2000);
        }
    };

    const handleOpenFlow = () => window.open('https://labs.google/fx/tools/flow', '_blank');
    const handleGetToken = () => window.open('https://labs.google/fx/api/auth/session', '_blank');

    const handleTestToken = useCallback(async () => {
        const tokenToTest = flowToken.trim() || currentUser?.personalAuthToken;
        if (!tokenToTest) return;
        setTestStatus('testing');
        setTestResults(null);
        try {
            const results = await runComprehensiveTokenTest(tokenToTest);
            setTestResults(results);
        } catch (err) {
            setError('Test failed');
        } finally {
            setTestStatus('idle');
        }
    }, [flowToken, currentUser?.personalAuthToken]);

    const handleGetNewToken = async () => {
        if (!currentUser) return;
        
        setIsLoadingToken(true);
        setTokenError(null);
        setGeneratedToken('');
        setTokenCredits(null);
        
        // Start countdown from 120 seconds
        setCountdown(120);
        
        // Clear any existing interval
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
        }
        
        // Start countdown timer
        countdownIntervalRef.current = window.setInterval(() => {
            setCountdown(prev => {
                if (prev === null) return null;
                return prev - 1;
            });
        }, 1000);
        
        const startTime = Date.now();
        
        try {
            // Use centralized API for all environments
            const apiUrl = await getBotAdminApiUrlWithFallback();
            
            // Use email, telegram_id, or username to find user
            const requestBody: { email?: string; telegram_id?: number; username?: string } = {};
            
            if (currentUser.email) {
                requestBody.email = currentUser.email;
            } else if (currentUser.id) {
                // Assuming id is telegram_id
                requestBody.telegram_id = currentUser.id;
            } else if (currentUser.username) {
                requestBody.username = currentUser.username;
            } else {
                setTokenError('User email, ID, or username is required');
                setIsLoadingToken(false);
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                    countdownIntervalRef.current = null;
                }
                setCountdown(null);
                return;
            }
            
            const response = await fetch(`${apiUrl}/api/generate-token-for-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            
            const data = await response.json();
            
            const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
            const remainingTime = 120 - elapsedTime;
            
            if (data.success) {
                setGeneratedToken(data.token);
                setTokenCredits(data.credits);
                setTokenError(null);
                // Optionally auto-fill the flow token field
                if (data.token) {
                    setFlowToken(data.token);
                }
                
                // Stop countdown if completed early
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                    countdownIntervalRef.current = null;
                }
                // If completed early, set to 0, otherwise show negative
                setCountdown(remainingTime > 0 ? 0 : remainingTime);
            } else {
                setTokenError(data.error || 'Failed to generate token');
                setGeneratedToken('');
                setTokenCredits(null);
                
                // Stop countdown on error
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                    countdownIntervalRef.current = null;
                }
                setCountdown(null);
            }
        } catch (err: any) {
            setTokenError(`Error: ${err.message || 'Failed to connect to API'}`);
            setGeneratedToken('');
            setTokenCredits(null);
            
            // Stop countdown on error
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
            }
            setCountdown(null);
        } finally {
            setIsLoadingToken(false);
        }
    };

    const handleCopyGeneratedToken = () => {
        if (generatedToken) {
            navigator.clipboard.writeText(generatedToken).then(() => {
                setTokenCopied(true);
                setTimeout(() => setTokenCopied(false), 2000);
            }).catch(err => {
                console.error('Failed to copy token:', err);
            });
        }
    };

    const handleSaveGeneratedToken = () => {
        if (generatedToken && currentUser) {
            // Set flowToken which will trigger auto-save after 2 seconds
            setFlowToken(generatedToken);
            setGeneratedTokenSaved(true);
            setTimeout(() => setGeneratedTokenSaved(false), 3000);
        }
    };

    if (!currentUser) return null;

    return (
        <div className="w-full">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Left Panel: Flow Login */}
                <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-6 h-full overflow-y-auto border border-neutral-200 dark:border-neutral-800">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                            <KeyIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">Flow Login</h2>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">Manage your manual authentication tokens</p>
                        </div>
                    </div>

                    {/* How to Get Token Instructions (MOVED TO TOP) */}
                    <div className="mb-6">
                        <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-[0.5px] border-blue-200 dark:border-blue-800">
                            <InformationCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="text-[11px] sm:text-xs text-blue-800 dark:text-blue-200">
                                <p className="text-[11px] sm:text-xs font-bold mb-2 uppercase tracking-wide">How to get your Flow Token:</p>
                                <ol className="text-[11px] sm:text-xs space-y-1.5 list-decimal list-inside font-medium">
                                    <li>Click "Generate NEW Token" button below</li>
                                    <li>Token will be automatically generated and saved</li>
                                    <li>You can use it immediately for your session</li>
                                </ol>
                            </div>
                        </div>
                    </div>

                    {/* Token Ultra Status Section */}
                    {!isLoadingUltra && ultraRegistration && (
                        <div className="mb-6 space-y-4 animate-zoomIn">
                            <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                                <ClockIcon className="w-5 h-5 text-primary-500" />
                                Token Ultra Status
                            </h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                    <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Status:</span>
                                    <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                                        ultraRegistration.status === 'active' 
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400'
                                        : ultraRegistration.status === 'expired'
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400'
                                    }`}>
                                        {ultraRegistration.status === 'active' ? 'Active' : ultraRegistration.status === 'expired' ? 'Expired' : 'Expiring Soon'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                    <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Active Until:</span>
                                    <span className="text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
                                        {new Date(ultraRegistration.expires_at).toLocaleDateString('en-GB', { 
                                            year: 'numeric', 
                                            month: 'long', 
                                            day: 'numeric' 
                                        }).toUpperCase()}
                                    </span>
                                </div>
                                
                                {ultraRegistration.status === 'expired' && (
                                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                                        <AlertTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-bold text-red-800 dark:text-red-200 mb-1">YOUR TOKEN ULTRA HAS EXPIRED</p>
                                            <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed">Please renew your token by submitting a new payment proof in the Token Ultra tab to continue using premium features.</p>
                                        </div>
                                    </div>
                                )}
                                {ultraRegistration.status === 'expiring_soon' && (
                                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
                                        <InformationCircleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-bold text-yellow-800 dark:text-yellow-200 mb-1">TOKEN ULTRA EXPIRING SOON</p>
                                            <p className="text-[11px] text-yellow-700 dark:text-yellow-300 leading-relaxed">Your token will expire soon. Please renew early in the Token Ultra tab to avoid any service interruption.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}


                    <div className="space-y-4">
                        <div>
                            <label htmlFor="flow-token" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Personal Token (Flow Token)</label>
                            <div className="relative">
                                <input id="flow-token" type={showToken ? 'text' : 'password'} value={flowToken} onChange={(e) => setFlowToken(e.target.value)} placeholder="Paste your Flow token here" className="w-full px-4 py-3 pr-20 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-sm" />
                                <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-2">
                                    {tokenSaved && flowToken.trim() && <span className="text-xs text-green-600 dark:text-green-400 font-medium">Saved</span>}
                                    {isSaving && <Spinner />}
                                    <button type="button" onClick={() => setShowToken(!showToken)} className="px-3 flex items-center text-neutral-500 hover:text-neutral-700">
                                        {showToken ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">Token used for image/video generation requests</p>
                        </div>

                        {testStatus === 'testing' && <div className="flex items-center gap-2 text-sm text-neutral-500"><Spinner /> {T_Api.testing}</div>}
                        {testResults && (
                            <div className="space-y-2">
                                {testResults.map(result => (
                                    <div key={result.service} className={`flex items-start gap-2 text-sm p-2 rounded-md ${result.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                                        {result.success ? <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"/> : <XIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"/>}
                                        <div>
                                            <span className={`font-semibold ${result.success ? 'text-green-800 dark:text-green-200' : 'text-red-700 dark:text-red-300'}`}>{result.service} Service</span>
                                            <p className={`text-xs ${result.success ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>{result.message}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-3">
                            {/* Hide "Login Google Flow" and "Get Token" buttons if Token Ultra is active */}
                            {!isTokenUltraActive() && (
                                <>
                                    <button onClick={handleOpenFlow} className="w-full flex items-center justify-center gap-2 bg-green-600 dark:bg-green-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors">
                                        <KeyIcon className="w-4 h-4" />
                                        Login Google Flow
                                    </button>
                                    <button onClick={handleGetToken} className="w-full flex items-center justify-center gap-2 bg-blue-600 dark:bg-blue-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                                        <KeyIcon className="w-4 h-4" />
                                        Get Token
                                    </button>
                                </>
                            )}
                            <button onClick={handleGetNewToken} disabled={isLoadingToken || !currentUser} className="w-full flex items-center justify-center gap-2 bg-purple-600 dark:bg-purple-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors disabled:opacity-50">
                                {isLoadingToken ? (
                                    <>
                                        <Spinner />
                                        {countdown !== null ? (
                                            <span>Generating Token... ({countdown > 0 ? `${countdown}s` : `-${Math.abs(countdown)}s`})</span>
                                        ) : (
                                            <span>Generating Token...</span>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <KeyIcon className="w-4 h-4" />
                                        Generate NEW Token
                                    </>
                                )}
                            </button>
                            <button onClick={handleTestToken} disabled={(!flowToken.trim() && !currentUser?.personalAuthToken) || testStatus === 'testing'} className="w-full flex items-center justify-center gap-2 bg-blue-600 dark:bg-blue-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">{testStatus === 'testing' ? <Spinner /> : <SparklesIcon className="w-4 h-4" />}Health Test</button>
                            <button
                                onClick={() => setIsVideoModalOpen(true)}
                                className="w-full flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            >
                                <PlayIcon className="w-4 h-4" />
                                Video Tutorial Login Google Flow
                            </button>
                        </div>

                        {/* Generated Token Output */}
                        {tokenError && (
                            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                                <p className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">Error:</p>
                                <p className="text-sm text-red-700 dark:text-red-300">{tokenError}</p>
                            </div>
                        )}

                        {generatedToken && (
                            <div className="mt-4 space-y-3">
                                <div className="p-4 bg-gray-50 dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Generated Token:
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleSaveGeneratedToken}
                                                className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors flex items-center gap-1"
                                            >
                                                {generatedTokenSaved ? (
                                                    <>
                                                        <CheckCircleIcon className="w-3 h-3" />
                                                        Saved!
                                                    </>
                                                ) : (
                                                    <>
                                                        <KeyIcon className="w-3 h-3" />
                                                        Save
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={handleCopyGeneratedToken}
                                                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1"
                                            >
                                                {tokenCopied ? (
                                                    <>
                                                        <CheckCircleIcon className="w-3 h-3" />
                                                        Copied!
                                                    </>
                                                ) : (
                                                    <>
                                                        <ClipboardIcon className="w-3 h-3" />
                                                        Copy
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        readOnly
                                        value={generatedToken}
                                        className="w-full p-3 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-600 rounded text-sm font-mono text-gray-800 dark:text-gray-200 resize-none"
                                        rows={6}
                                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                                    />
                                </div>

                                {/* Token Info */}
                                {tokenCredits !== null && (
                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <div className="space-y-1 text-sm">
                                            <p className="text-gray-700 dark:text-gray-300">
                                                <span className="font-semibold">Credits:</span> {tokenCredits.toLocaleString()}
                                            </p>
                                            <p className="text-gray-500 dark:text-gray-400 text-xs">
                                                Token generated from API
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: API & Anti-Captcha & Server Configuration */}
                <div className="flex flex-col gap-6">
                    {/* MONOklix API Keys Panel */}
                    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800">
                        <h3 className="text-base sm:text-lg font-bold mb-4 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                            <SparklesIcon className="w-5 h-5 text-primary-500" />
                            {T_Api.title}
                        </h3>
                        
                        <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-[0.5px] border-blue-200 dark:border-blue-800">
                            <div className="flex items-start gap-2 sm:gap-3">
                                <InformationCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                                <p className="text-[11px] sm:text-xs text-blue-800 dark:text-blue-200">
                                    {T_Api.description}
                                </p>
                            </div>
                            <div className="mt-3 flex items-center gap-2 text-sm font-medium">
                                <span className="text-neutral-600 dark:text-neutral-400">{T_Api.sharedStatus}</span>
                                {activeApiKey ? (
                                    <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                                        <CheckCircleIcon className="w-4 h-4" />
                                        {T_Api.connected}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-red-500">
                                        <XIcon className="w-4 h-4" />
                                        {T_Api.notLoaded}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Anti-Captcha Panel */}
                    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm h-auto overflow-y-auto border border-neutral-200 dark:border-neutral-800">
                        <h3 className="text-base sm:text-lg font-bold mb-4 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                            <KeyIcon className="w-5 h-5 text-primary-500" />
                            Anti-Captcha Configuration
                        </h3>

                        <div className="p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border-[0.5px] border-yellow-200 dark:border-yellow-800 mb-4">
                            <div className="flex items-start gap-2 sm:gap-3">
                                <InformationCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                                <div className="text-[11px] sm:text-xs text-yellow-800 dark:text-blue-200">
                                    <p className="text-[11px] sm:text-xs font-semibold mb-1">Required for Generation • Main Input</p>
                                    <p className="text-[11px] sm:text-xs">Google requires reCAPTCHA solving. This key allows the system to auto-solve it via <a href="https://anti-captcha.com" target="_blank" className="underline">anti-captcha.com</a>.</p>
                                    <p className="text-[11px] sm:text-xs mt-1.5 font-medium">💡 This is the primary input for your Anti-Captcha API key. Token auto-saves when you type.</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Anti-Captcha API Key</label>
                                <div className="relative">
                                    {/* Check if Token Ultra active and NOT blocked - show read-only with message */}
                                    {(() => {
                                        // Check if using master token from token_ultra_registrations
                                        const cachedReg = sessionStorage.getItem(`token_ultra_registration_${currentUser.id}`);
                                        let tokenUltraReg: any = null;
                                        
                                        if (cachedReg) {
                                            try {
                                                tokenUltraReg = JSON.parse(cachedReg);
                                            } catch (e) {
                                                // Ignore parse errors
                                            }
                                        }
                                        
                                        const isUsingMasterToken = tokenUltraReg && 
                                            tokenUltraReg.status === 'active' && 
                                            new Date(tokenUltraReg.expires_at) > new Date() &&
                                            tokenUltraReg.allow_master_token !== false;
                                        
                                        if (isUsingMasterToken) {
                                            return (
                                                <>
                                                    <div className="w-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 pr-10 text-blue-800 dark:text-blue-200 cursor-not-allowed">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <InformationCircleIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                                            <span className="text-xs font-semibold">Master Token (Read-only)</span>
                                                        </div>
                                                        <div className="text-xs font-mono truncate">
                                                            {showAntiCaptchaKey ? antiCaptchaApiKey : '•'.repeat(Math.min(antiCaptchaApiKey.length, 32))}
                                                        </div>
                                                    </div>
                                                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                                        <button 
                                                            onClick={() => setShowAntiCaptchaKey(!showAntiCaptchaKey)} 
                                                            className="text-blue-600 dark:text-blue-400 p-1 cursor-pointer" 
                                                            title="Toggle visibility"
                                                        >
                                                            {showAntiCaptchaKey ? <EyeOffIcon className="w-4 h-4"/> : <EyeIcon className="w-4 h-4"/>}
                                                        </button>
                                                    </div>
                                                </>
                                            );
                                        }
                                        
                                        return (
                                            <>
                                                <input 
                                                    type={showAntiCaptchaKey ? 'text' : 'password'} 
                                                    value={antiCaptchaApiKey} 
                                                    onChange={(e) => setAntiCaptchaApiKey(e.target.value)} 
                                                    placeholder="Enter your anti-captcha.com API key" 
                                                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2.5 pr-10 focus:ring-2 focus:ring-primary-500 font-mono text-sm" 
                                                />
                                                <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-2">
                                                    {recaptchaTokenSaved && antiCaptchaApiKey.trim() && <span className="text-xs text-green-600 dark:text-green-400 font-medium">Saved</span>}
                                                    {isSavingRecaptcha && <Spinner />}
                                                    <button onClick={() => setShowAntiCaptchaKey(!showAntiCaptchaKey)} className="px-3 flex items-center text-neutral-500 hover:text-neutral-700">
                                                        {showAntiCaptchaKey ? <EyeOffIcon className="w-4 h-4"/> : <EyeIcon className="w-4 h-4"/>}
                                                    </button>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                                <p className="text-xs text-neutral-500 mt-1">Token is auto-saved upon change.</p>
                            </div>

                            <div className="w-full space-y-2">
                                <button onClick={handleTestAntiCaptcha} disabled={!antiCaptchaApiKey || antiCaptchaTestStatus === 'testing'} className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
                                    {antiCaptchaTestStatus === 'testing' ? <Spinner /> : <SparklesIcon className="w-4 h-4" />}Test API Key
                                </button>
                                {antiCaptchaTestMessage && <span className={`text-sm font-medium ${antiCaptchaTestStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>{antiCaptchaTestMessage}</span>}
                                <button
                                    onClick={() => setIsAntiCaptchaVideoModalOpen(true)}
                                    className="w-full flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                >
                                    <PlayIcon className="w-4 h-4" />
                                    Video Tutorial Anti-Captcha
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Server Configuration Panel */}
                    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800">
                        <h3 className="text-base sm:text-lg font-bold mb-4 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                            <ServerIcon className="w-5 h-5 text-primary-500" />
                            Generation Server
                        </h3>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">Choose the backend server for processing your requests. Switching servers can help if one is slow or overloaded.</p>
                        
                        <div className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 flex items-center justify-between transition-all">
                            <div className="min-w-0 flex-1 mr-4">
                                <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-1">Status: Connected to</p>
                                <p className="font-mono text-sm text-primary-600 dark:text-primary-400 truncate">
                                    {currentServer ? currentServer.replace('https://', '').toUpperCase() : 'NOT CONFIGURED'}
                                </p>
                            </div>
                            <button 
                                onClick={onOpenChangeServerModal}
                                className="flex items-center justify-center gap-2 bg-primary-600 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-700 transition-colors shrink-0"
                            >
                                Change Server
                            </button>
                        </div>
                        
                        <div className="mt-4 flex items-start gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                            <InformationCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                            <p>Tip: iOS users are recommended to use servers labeled <b>S1, S2, S3, S4, or S6</b> for optimal compatibility.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Video Tutorial Modal - Fullscreen */}
            {isVideoModalOpen && (
                <div 
                    className="fixed inset-0 bg-black z-[9999] flex items-center justify-center animate-zoomIn"
                    onClick={() => setIsVideoModalOpen(false)}
                >
                    {/* Close Button */}
                    <button
                        onClick={() => setIsVideoModalOpen(false)}
                        className="absolute top-6 right-6 z-10 p-3 bg-black/70 hover:bg-black/90 rounded-full text-white transition-colors shadow-lg"
                        aria-label="Close video"
                    >
                        <XIcon className="w-6 h-6" />
                    </button>

                    {/* Fullscreen Video Player */}
                    <div 
                        className="relative w-full h-full flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <video
                            ref={videoRef}
                            src="https://monoklix.com/wp-content/uploads/2026/01/Video-01-Personal-Auth-Token.mp4"
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                            playsInline
                            onLoadedMetadata={() => {
                                if (videoRef.current) {
                                    videoRef.current.requestFullscreen?.().catch(err => {
                                        console.log('Fullscreen request failed:', err);
                                    });
                                }
                            }}
                        >
                            Your browser does not support the video tag.
                        </video>
                    </div>
                </div>
            )}

            {/* Anti-Captcha Video Tutorial Modal - Fullscreen */}
            {isAntiCaptchaVideoModalOpen && (
                <div 
                    className="fixed inset-0 bg-black z-[9999] flex items-center justify-center animate-zoomIn"
                    onClick={() => setIsAntiCaptchaVideoModalOpen(false)}
                >
                    {/* Close Button */}
                    <button
                        onClick={() => setIsAntiCaptchaVideoModalOpen(false)}
                        className="absolute top-6 right-6 z-10 p-3 bg-black/70 hover:bg-black/90 rounded-full text-white transition-colors shadow-lg"
                        aria-label="Close video"
                    >
                        <XIcon className="w-6 h-6" />
                    </button>

                    {/* Fullscreen Video Player */}
                    <div 
                        className="relative w-full h-full flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <video
                            ref={antiCaptchaVideoRef}
                            src="https://monoklix.com/wp-content/uploads/2026/01/Video-02-Anti-Captcha-API-Key.mp4"
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                            playsInline
                            onLoadedMetadata={() => {
                                if (antiCaptchaVideoRef.current) {
                                    antiCaptchaVideoRef.current.requestFullscreen?.().catch(err => {
                                        console.log('Fullscreen request failed:', err);
                                    });
                                }
                            }}
                        >
                            Your browser does not support the video tag.
                        </video>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FlowLogin;
