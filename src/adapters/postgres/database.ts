import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { PostgresDriver, SqlConnection, SqlValue } from "./driver";
import { typedDatabaseError } from "./errors";
import { migrate, type Migration } from "./migrate";

// A registered symbol, shared by every copy of this module: Next's dev server
// bundles a copy per route, and a JsonParam made by one copy must still be
// recognised by the database() another copy opened (with a module-local
// Symbol it wasn't, and node-postgres stored the value as {}).
const jsonText = Symbol.for("romaic.database.jsonText");

/**
 * A jsonb (or json) parameter: a value already turned into JSON text Postgres
 * will take. Only jsonParam makes one, so a plain string never passes for it.
 */
export type JsonParam = { readonly [jsonText]: string };

/**
 * A value as a jsonb parameter, made storable first. Postgres refuses U+0000
 * and unpaired surrogates in jsonb, so those become U+FFFD instead of failing
 * the statement. Bind it like any other parameter: `data = :data`.
 * (undefined, which JSON can't hold, binds as JSON null.)
 */
export function jsonParam(value: unknown): JsonParam {
  return { [jsonText]: JSON.stringify(storableJson(value)) ?? "null" };
}

function isJsonParam(value: SqlParam): value is JsonParam {
  return typeof value === "object" && value !== null && jsonText in value;
}

/** A named parameter's value. Dates bind as instants (ISO 8601, UTC); JSON goes through jsonParam. */
export type SqlParam = SqlValue | Date | JsonParam;

/** Named parameters, bound to :name placeholders. One name may appear several times. */
export type SqlParams = Readonly<Record<string, SqlParam>>;

/** Statements with named parameters. */
export type SqlExecutor = {
  /** Runs a statement, returning how many rows it changed. */
  run(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  /** The first row, or undefined when there's none. */
  get<Row>(sql: string, params?: SqlParams): Promise<Row | undefined>;
  /** Every row. */
  all<Row>(sql: string, params?: SqlParams): Promise<Row[]>;
};

declare const inTransaction: unique symbol;

/**
 * Statements inside Database.transaction: only these see and hold its locks.
 * Helpers that must run inside a transaction take this type, so passing the
 * database itself doesn't compile.
 */
export type SqlTransaction = SqlExecutor & { readonly [inTransaction]: true };

/**
 * A Postgres database with the app's schema, migrated before its first
 * statement runs. Constraint errors come back typed (see ./errors.ts), and
 * text is made storable on the way in: Postgres refuses U+0000, so it
 * becomes U+FFFD instead of failing the statement.
 */
export type Database = SqlExecutor & {
  /**
   * Runs `work` as one transaction: it all happens or none of it does. Run
   * every statement through `tx`. The database itself is another connection,
   * which would wait on this transaction's locks (and on PGlite, wait
   * forever), so using it inside `work` throws.
   */
  transaction<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export type DatabaseOptions = {
  /** Applied, in order, before the first statement (see ./migrations/registry.ts). */
  migrations: readonly Migration[];
};

const insideTransaction = new AsyncLocalStorage<true>();

function outsideTransactions(): void {
  if (insideTransaction.getStore()) {
    throw new Error(
      "Inside db.transaction, run statements through its tx: the database is another connection and would wait on this transaction's locks.",
    );
  }
}

/**
 * The app's database over a driver. Pending migrations run once, before the
 * first statement; if they fail, the next statement tries again rather than
 * failing every request until a restart.
 */
export function openDatabase(driver: PostgresDriver, { migrations }: DatabaseOptions): Database {
  let migrated: Promise<unknown> | null = null;
  const ready = () =>
    (migrated ??= migrate(driver, migrations).catch((error: unknown) => {
      migrated = null;
      throw typedDatabaseError(error);
    }));
  const direct = executorOn(driver);

  return {
    async run(sql, params) {
      outsideTransactions();
      await ready();
      return direct.run(sql, params);
    },
    async get<Row>(sql: string, params?: SqlParams) {
      outsideTransactions();
      await ready();
      return direct.get<Row>(sql, params);
    },
    async all<Row>(sql: string, params?: SqlParams) {
      outsideTransactions();
      await ready();
      return direct.all<Row>(sql, params);
    },
    async transaction(work) {
      outsideTransactions();
      await ready();
      try {
        return await driver.transaction((connection) => insideTransaction.run(true, () => work(executorOn(connection) as SqlTransaction)));
      } catch (error) {
        // Deferred constraints are checked at commit, outside any one statement.
        throw typedDatabaseError(error);
      }
    },
    close: () => driver.close(),
  };
}

function executorOn(connection: SqlConnection): SqlExecutor {
  const query = async <Row>(sql: string, params: SqlParams) => {
    const { text, values } = bind(sql, params);
    try {
      return await connection.query<Row>(text, values);
    } catch (error) {
      throw typedDatabaseError(error);
    }
  };
  return {
    async run(sql, params = {}) {
      return { changes: (await query(sql, params)).rowCount };
    },
    async get<Row>(sql: string, params: SqlParams = {}) {
      return (await query<Row>(sql, params)).rows[0];
    },
    async all<Row>(sql: string, params: SqlParams = {}) {
      return (await query<Row>(sql, params)).rows;
    },
  };
}

/** A :name not part of a :: cast. Names start with a letter or underscore, so times like '10:30' are left alone. */
const placeholder = /(?<![:\w]):([A-Za-z_]\w*)/g;

const compiled = new Map<string, { text: string; names: string[] }>();

/**
 * Turns :name placeholders into Postgres's $1, $2, …, reusing a number when
 * a name repeats, and makes values ready for a driver. Pass constant SQL and
 * put every value in `params`: each distinct text is compiled once and kept,
 * and nothing anyone typed ever becomes part of a statement.
 */
export function bind(sql: string, params: SqlParams): { text: string; values: SqlValue[] } {
  let statement = compiled.get(sql);
  if (!statement) {
    const names: string[] = [];
    const text = sql.replace(placeholder, (_, name: string) => {
      const index = names.includes(name) ? names.indexOf(name) : names.push(name) - 1;
      return `$${index + 1}`;
    });
    statement = { text, names };
    compiled.set(sql, statement);
  }
  const values = statement.names.map((name) => {
    const value = params[name];
    if (value === undefined || !Object.hasOwn(params, name)) throw new Error(`No value given for :${name}`);
    return driverValue(value);
  });
  return { text: statement.text, values };
}

/** Text Postgres can hold: U+0000 becomes U+FFFD. Drivers already turn unpaired surrogates into U+FFFD as they encode text. */
function storableText(text: string): string {
  return text.includes("\u0000") ? text.replaceAll("\u0000", "�") : text;
}

/**
 * A string exactly as a text column gives it back: unpaired surrogates and
 * U+0000 as U+FFFD. For a value that must match what's read back later,
 * such as an audit entry's hash.
 */
export function storedText(text: string): string {
  return storableText(text.toWellFormed());
}

/** A JSON value exactly as a jsonb column gives it back (see jsonParam), for the same purpose as storedText. */
export function storedJson(value: unknown): unknown {
  return JSON.parse(jsonParam(value)[jsonText]);
}

function driverValue(value: SqlParam): SqlValue {
  if (typeof value === "string") return storableText(value);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("An invalid Date can't be stored.");
    return value.toISOString();
  }
  if (isJsonParam(value)) return value[jsonText];
  if (Array.isArray(value)) return value.map((item: string | number) => (typeof item === "string" ? storableText(item) : item)) as SqlValue;
  return value as SqlValue;
}

/** A copy of a JSON value whose strings and keys jsonb will take: no U+0000 and no unpaired surrogates. */
function storableJson(value: unknown): unknown {
  if (typeof value === "string") return storableText(value.toWellFormed());
  if (Array.isArray(value)) return value.map(storableJson);
  if (value !== null && typeof value === "object") {
    if ("toJSON" in value && typeof value.toJSON === "function") return storableJson(value.toJSON());
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [storableText(key.toWellFormed()), storableJson(entry)]));
  }
  return value;
}
