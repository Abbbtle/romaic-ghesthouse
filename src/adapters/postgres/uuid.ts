const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value can be a uuid column's value. Stores check ids they're
 * given before querying, so an id that can't exist finds nothing instead of
 * Postgres refusing the statement.
 */
export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}
