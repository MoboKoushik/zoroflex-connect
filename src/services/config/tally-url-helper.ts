// src/services/config/tally-url-helper.ts

/**
 * Get the default Tally URL
 */
export function getDefaultTallyUrl(): string {
  return 'http://localhost:9000';
}

/**
 * Get Tally URL from settings or return default
 */
export async function getTallyUrl(dbService: any): Promise<string> {
  try {
    // First try to get the full tallyUrl setting
    const savedUrl = await dbService.getSetting('tallyUrl');
    if (savedUrl) {
      return savedUrl;
    }

    // Fall back to tallyPort setting
    const savedPort = await dbService.getSetting('tallyPort');
    if (savedPort) {
      const portNumber = parseInt(savedPort, 10);
      if (!isNaN(portNumber) && portNumber > 0 && portNumber <= 65535) {
        return `http://localhost:${portNumber}`;
      }
    }
  } catch (error) {
    console.error('Error getting Tally URL from settings:', error);
  }
  return getDefaultTallyUrl();
}

/**
 * Get Tally port from URL
 */
export function getTallyPort(tallyUrl: string): number {
  try {
    const url = new URL(tallyUrl);
    return parseInt(url.port || '9000', 10);
  } catch {
    return 9000;
  }
}
