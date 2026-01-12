import { app } from 'electron';

/**
 * Get the default API URL based on the environment
 * - Development: http://localhost:3000
 * - Production/Exe: https://uatarmapi.a10s.in
 */
export function getDefaultApiUrl(): string {
  // Check if app is packaged (exe file)
  if (app.isPackaged) {
    return 'http://localhost:3000';
  }
  return 'http://localhost:3000';
}

/**
 * Get API URL from settings or return default based on environment
 */
export async function getApiUrl(dbService: any): Promise<string> {
  try {
    const savedUrl = await dbService.getSetting('apiEndpoint');
    if (savedUrl) {
      return savedUrl;
    }
  } catch (error) {
    console.error('Error getting API URL from settings:', error);
  }
  return getDefaultApiUrl();
}


