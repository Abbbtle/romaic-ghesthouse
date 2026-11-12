/**
 * Postgres refusing a write because of a constraint, as typed errors the
 * stores can act on: a clash on a unique email address becomes "that email
 * can't be used", an overlap caught by an exclusion constraint becomes the
 * diary's "clashes with …" answer. ./database.ts turns driver errors into
 * these on every statement.
 *
 * They carry the constraint's name (every migration names the constraints
 * stores look for) and never the clashing values, which Postgres puts in its
 * error detail and which can be personal data.
 */
export class ConstraintViolationError extends Error {
  constructor(
    /** The SQLSTATE Postgres answered with. */
    readonly code: string,
    /** The constraint that refused the write, as named in its migration. */
    readonly constraint: string,
    /** The table it belongs to, when Postgres says. */
    readonly table: string | null,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A write would have repeated a value a unique constraint allows once (SQLSTATE 23505). */
export class UniqueViolationError extends ConstraintViolationError {
  constructor(constraint: string, table: string | null) {
    super(sqlStates.uniqueViolation, constraint, table, `A unique constraint refused the write: ${constraint}.`);
  }
}

/** A write would have overlapped a row an exclusion constraint keeps apart (SQLSTATE 23P01). */
export class ExclusionViolationError extends ConstraintViolationError {
  constructor(constraint: string, table: string | null) {
    super(sqlStates.exclusionViolation, constraint, table, `An exclusion constraint refused the write: ${constraint}.`);
  }
}

const sqlStates = { uniqueViolation: "23505", exclusionViolation: "23P01" } as const;

/**
 * The typed error for a driver's constraint error, or the error itself when
 * it's anything else (one already typed included: a statement's error passes
 * through its transaction). Both node-postgres and PGlite put the SQLSTATE in
 * `code` and the constraint's name in `constraint`.
 */
export function typedDatabaseError(error: unknown): unknown {
  if (error instanceof ConstraintViolationError) return error;
  if (typeof error !== "object" || error === null || !("code" in error)) return error;
  const constraint = "constraint" in error && typeof error.constraint === "string" ? error.constraint : "";
  const table = "table" in error && typeof error.table === "string" ? error.table : null;
  if (error.code === sqlStates.uniqueViolation) return new UniqueViolationError(constraint, table);
  if (error.code === sqlStates.exclusionViolation) return new ExclusionViolationError(constraint, table);
  return error;
}
