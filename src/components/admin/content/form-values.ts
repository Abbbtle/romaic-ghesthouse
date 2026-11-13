import { z } from "zod";

/**
 * Reads a form whose fields are named by dotted path ("hero.headline.0",
 * "groups.1.plans.0.price") into the shape a zod schema takes, so the form
 * can be checked with the schema the server uses and errors, keyed by the
 * same paths, land on the fields that caused them.
 *
 * Form fields only hold text, so the schema says what each one means:
 * - text, choices and dates are read as typed; a missing field is undefined;
 * - a number is read as a number, an empty one as undefined (a whole-rand
 *   price typed with commas isn't a number: RandsField posts bare digits);
 * - a switch or checkbox is true when it posted (as "on"), false when not;
 * - a list has an item for each index that has fields ("plans.0.…",
 *   "plans.2.…"), in index order, so removed rows simply leave no fields;
 * - a nullable or optional value is null (undefined) when it's missing: an
 *   empty field, or for an object, list or choice of shapes, no fields at
 *   all, which is how an editor says "none" (it doesn't render them);
 * - a choice of shapes (a discriminated union, such as where a button
 *   leads) is read as the shape its discriminator field names;
 * - a value with a default is undefined when nothing was posted for it, so
 *   the default applies.
 */
export function formValues(schema: z.core.$ZodType, form: FormData): unknown {
  const names = [...new Set(form.keys())];
  return read(schema, { form, names }, "");
}

type Fields = { form: FormData; names: readonly string[] };

function read(schema: z.core.$ZodType, fields: Fields, path: string): unknown {
  const def = (schema as z.core.$ZodTypes)._zod.def;
  switch (def.type) {
    case "object":
      return Object.fromEntries(Object.entries(def.shape).map(([key, field]) => [key, read(field, fields, at(path, key))]));
    case "array":
      return indexesUnder(fields, path).map((index) => read(def.element, fields, at(path, index)));
    case "tuple":
      return def.items.map((item, index) => read(item, fields, at(path, index)));
    case "union":
      return "discriminator" in def && typeof def.discriminator === "string"
        ? readShape(schema as z.core.$ZodDiscriminatedUnion, def.discriminator, fields, path)
        : textAt(fields, path);
    case "nullable":
      return isMissing(def.innerType, fields, path) ? null : read(def.innerType, fields, path);
    case "optional":
      return isMissing(def.innerType, fields, path) ? undefined : read(def.innerType, fields, path);
    case "default":
    case "prefault":
      return isMissing(def.innerType, fields, path) ? undefined : read(def.innerType, fields, path);
    case "pipe":
      return read(def.in, fields, path);
    case "readonly":
    case "catch":
    case "nonoptional":
      return read(def.innerType, fields, path);
    case "boolean":
      return fields.form.has(path);
    case "number":
      return numberAt(fields, path);
    default:
      return textAt(fields, path);
  }
}

/** A choice of shapes: the one its discriminator field names, or just that field when it names none, so the schema can say what's wrong. */
function readShape(union: z.core.$ZodDiscriminatedUnion, discriminator: string, fields: Fields, path: string): unknown {
  const value = textAt(fields, at(path, discriminator));
  const option = value === undefined ? undefined : z.core.getDiscriminatedOption(union, value as never);
  return option ? read(option, fields, path) : { [discriminator]: value };
}

/** Whether a nullable, optional or defaulted value was left out: an empty field, or for anything made of fields, none at all. */
function isMissing(schema: z.core.$ZodType, fields: Fields, path: string): boolean {
  return holdsFields(schema) ? !fields.names.some((name) => name.startsWith(`${path}.`)) : (textAt(fields, path) ?? "") === "";
}

/** Whether a value is made of several fields (an object, a list, a choice of shapes) rather than being one. */
function holdsFields(schema: z.core.$ZodType): boolean {
  const def = (schema as z.core.$ZodTypes)._zod.def;
  switch (def.type) {
    case "object":
    case "array":
    case "tuple":
    case "union":
      return true;
    case "pipe":
      return holdsFields(def.in);
    case "nullable":
    case "optional":
    case "default":
    case "prefault":
    case "readonly":
    case "catch":
    case "nonoptional":
      return holdsFields(def.innerType);
    default:
      return false;
  }
}

/** The indexes a list has fields for, in order: "plans.0.name" and "plans.2.name" give [0, 2]. */
function indexesUnder(fields: Fields, path: string): number[] {
  const prefix = `${path}.`;
  const indexes = new Set<number>();
  for (const name of fields.names) {
    if (!name.startsWith(prefix)) continue;
    const segment = name.slice(prefix.length).split(".", 1)[0] ?? "";
    if (/^\d+$/.test(segment)) indexes.add(Number(segment));
  }
  return [...indexes].sort((a, b) => a - b);
}

function textAt(fields: Fields, path: string): string | undefined {
  const value = fields.form.get(path);
  return typeof value === "string" ? value : undefined;
}

function numberAt(fields: Fields, path: string): number | undefined {
  const value = textAt(fields, path)?.trim();
  return value ? Number(value) : undefined;
}

function at(path: string, key: string | number): string {
  return path ? `${path}.${key}` : String(key);
}
