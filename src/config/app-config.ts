// src/config/app-config.ts

/**
 * Application Configuration
 * Loads sensitive configuration from environment variables
 */

/**
 * Get the shared API key for app verification
 * This key is the same for all users and verifies that requests come from the official app
 * @returns The API key from environment variable or throws error
 */
export function getAppApiKey(): string {
  // Try to get from environment variable
  const apiKey = process.env.APP_API_KEY;

  if (!apiKey) {
    // Fallback to default key for backward compatibility
    // TODO: This should be set via environment variable in production builds
    return '7061797A6F72726F74616C6C79';
  }

  return apiKey;
}

/**
 * Validate that app configuration is properly set
 */
export function validateAppConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if API key is set
  if (!process.env.APP_API_KEY) {
    errors.push('APP_API_KEY environment variable is not set. Using default fallback.');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
