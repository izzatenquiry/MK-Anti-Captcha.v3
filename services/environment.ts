/**
 * Environment Detection Utility
 * Detects if running in Electron, localhost, or production web environment
 */

export const isElectron = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'file:' ||
    !!(window as any).electron ||
    window.navigator.userAgent.includes('Electron')
  );
};

export const isLocalhost = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
};

export const isProduction = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'app.monoklix.com' || hostname === 'dev.monoklix.com';
};

export const getEnvironment = (): 'electron' | 'web-localhost' | 'web-production' => {
  if (isElectron()) return 'electron';
  if (isProduction()) return 'web-production';
  return 'web-localhost';
};

