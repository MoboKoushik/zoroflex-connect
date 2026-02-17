// src/utils/ipc-validators.ts

/**
 * IPC Parameter Validation Utilities
 * Validates all user inputs from renderer process to prevent injection attacks
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate email format
 */
export function validateEmail(email: any): ValidationResult {
  if (typeof email !== 'string') {
    return { isValid: false, error: 'Email must be a string' };
  }

  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return { isValid: false, error: 'Email cannot be empty' };
  }

  if (trimmedEmail.length > 255) {
    return { isValid: false, error: 'Email too long (max 255 characters)' };
  }

  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { isValid: false, error: 'Invalid email format' };
  }

  return { isValid: true };
}

/**
 * Validate password
 */
export function validatePassword(password: any): ValidationResult {
  if (typeof password !== 'string') {
    return { isValid: false, error: 'Password must be a string' };
  }

  if (!password || password.length === 0) {
    return { isValid: false, error: 'Password cannot be empty' };
  }

  if (password.length > 1000) {
    return { isValid: false, error: 'Password too long (max 1000 characters)' };
  }

  return { isValid: true };
}

/**
 * Validate positive integer
 */
export function validatePositiveInteger(value: any, fieldName: string = 'Value'): ValidationResult {
  if (typeof value !== 'number') {
    return { isValid: false, error: `${fieldName} must be a number` };
  }

  if (!Number.isInteger(value)) {
    return { isValid: false, error: `${fieldName} must be an integer` };
  }

  if (value <= 0) {
    return { isValid: false, error: `${fieldName} must be positive` };
  }

  if (value > Number.MAX_SAFE_INTEGER) {
    return { isValid: false, error: `${fieldName} too large` };
  }

  return { isValid: true };
}

/**
 * Validate integer within range
 */
export function validateIntegerRange(
  value: any,
  min: number,
  max: number,
  fieldName: string = 'Value'
): ValidationResult {
  if (typeof value !== 'number') {
    return { isValid: false, error: `${fieldName} must be a number` };
  }

  if (!Number.isInteger(value)) {
    return { isValid: false, error: `${fieldName} must be an integer` };
  }

  if (value < min || value > max) {
    return { isValid: false, error: `${fieldName} must be between ${min} and ${max}` };
  }

  return { isValid: true };
}

/**
 * Validate setting key (alphanumeric + underscore only)
 */
export function validateSettingKey(key: any): ValidationResult {
  if (typeof key !== 'string') {
    return { isValid: false, error: 'Setting key must be a string' };
  }

  const trimmedKey = key.trim();

  if (!trimmedKey) {
    return { isValid: false, error: 'Setting key cannot be empty' };
  }

  if (trimmedKey.length > 100) {
    return { isValid: false, error: 'Setting key too long (max 100 characters)' };
  }

  // Only alphanumeric, underscore, and hyphen allowed
  const keyRegex = /^[a-zA-Z0-9_-]+$/;
  if (!keyRegex.test(trimmedKey)) {
    return { isValid: false, error: 'Setting key can only contain letters, numbers, underscore, and hyphen' };
  }

  return { isValid: true };
}

/**
 * Validate setting value
 */
export function validateSettingValue(value: any): ValidationResult {
  if (typeof value !== 'string') {
    return { isValid: false, error: 'Setting value must be a string' };
  }

  // Allow empty values (for clearing settings)
  if (value.length > 10000) {
    return { isValid: false, error: 'Setting value too long (max 10000 characters)' };
  }

  return { isValid: true };
}

/**
 * Validate search query string
 */
export function validateSearchQuery(search: any): ValidationResult {
  if (search === null || search === undefined) {
    return { isValid: true }; // Optional parameter
  }

  if (typeof search !== 'string') {
    return { isValid: false, error: 'Search query must be a string' };
  }

  if (search.length > 500) {
    return { isValid: false, error: 'Search query too long (max 500 characters)' };
  }

  return { isValid: true };
}

/**
 * Validate enum value
 */
export function validateEnum(
  value: any,
  allowedValues: string[],
  fieldName: string = 'Value'
): ValidationResult {
  if (typeof value !== 'string') {
    return { isValid: false, error: `${fieldName} must be a string` };
  }

  if (!allowedValues.includes(value)) {
    return { isValid: false, error: `${fieldName} must be one of: ${allowedValues.join(', ')}` };
  }

  return { isValid: true };
}

/**
 * Validate optional positive integer
 */
export function validateOptionalPositiveInteger(
  value: any,
  fieldName: string = 'Value'
): ValidationResult {
  if (value === null || value === undefined) {
    return { isValid: true }; // Optional parameter
  }

  return validatePositiveInteger(value, fieldName);
}

/**
 * Validate filters object (for get-api-logs, get-tally-voucher-logs)
 */
export function validateFilters(filters: any): ValidationResult {
  if (filters === null || filters === undefined) {
    return { isValid: true }; // Optional parameter
  }

  if (typeof filters !== 'object') {
    return { isValid: false, error: 'Filters must be an object' };
  }

  // Check each filter property
  if (filters.limit !== undefined) {
    const limitValidation = validateOptionalPositiveInteger(filters.limit, 'Limit');
    if (!limitValidation.isValid) {
      return limitValidation;
    }
  }

  if (filters.offset !== undefined) {
    const offsetValidation = validateOptionalPositiveInteger(filters.offset, 'Offset');
    if (!offsetValidation.isValid) {
      return offsetValidation;
    }
  }

  if (filters.search !== undefined) {
    const searchValidation = validateSearchQuery(filters.search);
    if (!searchValidation.isValid) {
      return searchValidation;
    }
  }

  return { isValid: true };
}
