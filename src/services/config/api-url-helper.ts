import { app } from 'electron';

/**
 * Get the default API URL based on the environment
 * - Development: http://localhost:5000 (tally-gateway)
 * - Production/Exe: https://uatarmapi.a10s.in:5000 (or configured URL)
 */
export function getDefaultApiUrl(): string {
  // Check if app is packaged (exe file)
  if (app.isPackaged) {
    // In production, use the production URL with port 5000 for tally-gateway
    return 'https://uatarmapi.a10s.in:5000';
  }
  // Development: Use 127.0.0.1 instead of localhost to avoid IPv6 (::1) issues
  // This ensures we connect to IPv4 which is more reliable
  return 'http://127.0.0.1:5000';
}

/**
 * Normalize URL to use IPv4 (127.0.0.1) instead of localhost to avoid IPv6 issues
 */
function normalizeUrl(url: string): string {
  // Replace localhost with 127.0.0.1 to force IPv4
  return url.replace(/localhost/g, '127.0.0.1');
}

/**
 * Get API URL from settings or return default based on environment
 * Always normalizes localhost to 127.0.0.1 to avoid IPv6 connection issues
 */
export async function getApiUrl(dbService: any): Promise<string> {
  try {
    const savedUrl = await dbService.getSetting('apiEndpoint');
    if (savedUrl) {
      return normalizeUrl(savedUrl);
    }
  } catch (error) {
    console.error('Error getting API URL from settings:', error);
  }
  return getDefaultApiUrl();
}


