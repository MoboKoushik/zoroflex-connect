// src/services/config/api-key-helper.ts

/**
 * Get API Key from profile or settings
 * This centralizes API key retrieval to avoid hardcoding
 */
export async function getApiKey(dbService: any): Promise<string> {
  try {
    // First try to get from profile
    const profile = await dbService.getProfile();
    if (profile?.apikey) {
      return profile.apikey;
    }

    // Fall back to settings
    const savedApiKey = await dbService.getSetting('apiKey');
    if (savedApiKey) {
      return savedApiKey;
    }
  } catch (error) {
    console.error('Error getting API key:', error);
  }

  // Return empty string if not found - caller should handle this
  return '';
}

/**
 * Validate API key exists
 */
export async function validateApiKey(dbService: any): Promise<boolean> {
  const apiKey = await getApiKey(dbService);
  return apiKey.length > 0;
}
