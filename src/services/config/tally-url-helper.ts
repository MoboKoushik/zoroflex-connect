// src/services/config/tally-url-helper.ts

/**
 * Validation result for Tally input
 */
export interface TallyInputValidation {
  type: 'port' | 'url' | 'invalid';
  isValid: boolean;
  resolvedUrl: string | null;
  error: string | null;
}

/**
 * Validate Tally input (port number or full URL)
 */
export function validateTallyInput(input: string): TallyInputValidation {
  if (!input || input.trim() === '') {
    return {
      type: 'invalid',
      isValid: false,
      resolvedUrl: null,
      error: null, // Empty is allowed (will use default)
    };
  }

  input = input.trim();

  // Check if it's a number (port)
  if (/^\d+$/.test(input)) {
    const port = parseInt(input, 10);
    if (port >= 1 && port <= 65535) {
      return {
        type: 'port',
        isValid: true,
        resolvedUrl: `http://localhost:${port}`,
        error: null,
      };
    }
    return {
      type: 'port',
      isValid: false,
      resolvedUrl: null,
      error: 'Port must be between 1 and 65535',
    };
  }

  // Check if it's a URL
  if (input.startsWith('http://') || input.startsWith('https://')) {
    try {
      const url = new URL(input);
      if (!url.port) {
        return {
          type: 'url',
          isValid: false,
          resolvedUrl: null,
          error: 'URL must include a port number (e.g., http://192.168.1.100:9000)',
        };
      }
      const port = parseInt(url.port, 10);
      if (port < 1 || port > 65535) {
        return {
          type: 'url',
          isValid: false,
          resolvedUrl: null,
          error: 'Port must be between 1 and 65535',
        };
      }
      return {
        type: 'url',
        isValid: true,
        resolvedUrl: input,
        error: null,
      };
    } catch (e) {
      return {
        type: 'url',
        isValid: false,
        resolvedUrl: null,
        error: 'Invalid URL format',
      };
    }
  }

  return {
    type: 'invalid',
    isValid: false,
    resolvedUrl: null,
    error: 'Enter a port number (e.g., 9000) or full URL (e.g., http://192.168.1.100:9000)',
  };
}

/**
 * Get the default Tally URL
 */
export function getDefaultTallyUrl(): string {
  return 'http://localhost:9000';
}

/**
 * Get Tally URL from settings or return default
 * Priority: tallyServerUrl -> tallyUrl -> tallyPort -> default
 */
export async function getTallyUrl(dbService: any): Promise<any> {
  try {
    // Priority 1: Check for new tallyServerUrl setting
    const serverUrl = await dbService.getSetting('tallyServerUrl');
    console.log('[getTallyUrl] Priority 1 - tallyServerUrl from DB:', serverUrl);
    if (serverUrl) {
      const validation = validateTallyInput(serverUrl);
      console.log('[getTallyUrl] Validation result:', validation);
      if (validation.isValid && validation.resolvedUrl) {
        console.log('[getTallyUrl] ✓ Using tallyServerUrl:', validation.resolvedUrl);
        return validation.resolvedUrl;
      }
      // If invalid, log warning and continue to fallback
      console.warn('[getTallyUrl] Invalid tallyServerUrl setting, falling back:', validation.error);
    }

    // Priority 2: Check for legacy full tallyUrl setting
    const savedUrl = await dbService.getSetting('tallyUrl');
    console.log('[getTallyUrl] Priority 2 - tallyUrl from DB:', savedUrl);
    if (savedUrl) {
      console.log('[getTallyUrl] ✓ Using tallyUrl:', savedUrl);
      return savedUrl;
    }

    // Priority 3: Fall back to tallyPort setting
    const savedPort = await dbService.getSetting('tallyPort');
    console.log('[getTallyUrl] Priority 3 - tallyPort from DB:', savedPort);
    if (savedPort) {
      const portNumber = parseInt(savedPort, 10);
      if (!isNaN(portNumber) && portNumber > 0 && portNumber <= 65535) {
        const url = `http://localhost:${portNumber}`;
        console.log('[getTallyUrl] ✓ Using tallyPort, constructed URL:', url);
        return url;
      }
    }
  } catch (error) {
    console.error('[getTallyUrl] Error getting Tally URL from settings:', error);
  }
  console.log('[getTallyUrl] ✓ Using default:', getDefaultTallyUrl());
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
