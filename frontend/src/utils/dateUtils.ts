/**
 * Date utility functions for the application.
 */

/**
 * Ensures any date string includes time (RFC 3339).
 * If only YYYY-MM-DD is provided, appends the current time.
 *
 * @param value - Optional date string (may or may not include time)
 * @returns ISO 8601 datetime string with time component
 *
 * @example
 * toISODateTime('2024-01-15') // '2024-01-15T10:30:45.123Z'
 * toISODateTime('2024-01-15T14:30:00') // '2024-01-15T14:30:00'
 * toISODateTime() // '2024-01-15T10:30:45.123Z' (current time)
 */
export function toISODateTime(value?: string): string {
  if (!value) return new Date().toISOString();
  const s = String(value);
  if (s.includes('T')) return s;
  const timePart = new Date().toISOString().split('T')[1];
  return `${s}T${timePart}`;
}

/**
 * Gets today's date in YYYY-MM-DD format.
 *
 * @returns Today's date as a string in local date format
 */
export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}
