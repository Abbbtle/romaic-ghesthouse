import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { parseSection, sectionKeys, sectionSchemas } from "@/lib/content/schema";
import { sampleContent } from "@/lib/content/testing/sample-content";
import { formValues } from "./form-values";

/**
 * The fields an editor posts for `value`, named by dotted path the way the
 * section editors name them: switches post "on" only when on, an empty
 * nullable value posts an empty field, and a list posts each row.
 */
function formOf(value: unknown): FormData {
  const form = new FormData();
  const add = (path: string, item: unknown): void => {
    if (item === null) form.append(path, "");
    else if (typeof item === "boolean") {
      if (item) form.append(path, "on");
    } else if (Array.isArray(item)) item.forEach((entry, index) => add(`${path}.${index}`, entry));
    else if (typeof item === "object") for (const [key, entry] of Object.entries(item)) add(path ? `${path}.${key}` : key, entry);
    else form.append(path, String(item));
  };
  add("", value);
  return form;
}

function withField(form: FormData, name: string, value: string | null): FormData {
  const changed = new FormData();
  for (const [key, entry] of form.entries()) if (key !== name) changed.append(key, entry);
  if (value !== null) changed.append(name, value);
  return changed;
}

function withoutFieldsUnder(form: FormData, prefix: string): FormData {
  const kept = new FormData();
  for (const [key, entry] of form.entries()) if (key !== prefix && !key.startsWith(`${prefix}.`)) kept.append(key, entry);
  return kept;
}

describe("formValues", () => {
  it("reads every section back from its fields exactly as it was", () => {
    const content = sampleContent();
    for (const key of sectionKeys) {
      const read = formValues(sectionSchemas[key], formOf(content[key]));
      assert.deepEqual(parseSection(key, read), { ok: true, value: content[key] }, key);
    }
  });

  it("reads an evening band whose photos were all removed as one with no photos", () => {
    const form = withoutFieldsUnder(formOf(sampleContent().home), "evenings.photos");
    const read = formValues(sectionSchemas.home, form);
    const parsed = parseSection("home", read);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value.evenings?.photos, []);
  });

  it("reads a switch as on only when it posted", () => {
    const schema = z.object({ visible: z.boolean(), featured: z.boolean() });
    const form = new FormData();
    form.append("visible", "on");
    assert.deepEqual(formValues(schema, form), { visible: true, featured: false });
  });

  it("keeps a list's rows in order, skipping the ones removed", () => {
    const schema = z.object({ amenities: z.array(z.string()) });
    const form = new FormData();
    form.append("amenities.2", "Secure parking");
    form.append("amenities.0", "Fast Wi-Fi");
    assert.deepEqual(formValues(schema, form), { amenities: ["Fast Wi-Fi", "Secure parking"] });
    assert.deepEqual(formValues(schema, new FormData()), { amenities: [] });
  });

  it("reads numbers, leaving an empty one out so the schema can say what to enter", () => {
    const schema = z.object({ guests: z.number().nullable(), nights: z.number() });
    const form = new FormData();
    form.append("guests", " 4 ");
    form.append("nights", "");
    assert.deepEqual(formValues(schema, form), { guests: 4, nights: undefined });
  });

  it("reads an empty WhatsApp number as none, and a number it can't read as a problem with that number", () => {
    const fields = formOf(sampleContent().contact);
    const none = parseSection("contact", formValues(sectionSchemas.contact, withField(fields, "whatsapp", "")));
    assert.ok(none.ok);
    assert.equal(none.value.whatsapp, null);

    const separate = parseSection("contact", formValues(sectionSchemas.contact, withField(fields, "whatsapp", "083 123 4567")));
    assert.ok(separate.ok);
    assert.equal(separate.value.whatsapp, "+27831234567");

    const unreadable = parseSection("contact", formValues(sectionSchemas.contact, withField(fields, "whatsapp", "12")));
    assert.deepEqual(unreadable, { ok: false, errors: { whatsapp: "Enter a WhatsApp number like 082 123 4567 or +27 82 123 4567." } });
  });

  it("reads a footer credit whose fields aren't there as none", () => {
    const fields = withoutFieldsUnder(formOf(sampleContent().site), "footerCredit");
    const read = parseSection("site", formValues(sectionSchemas.site, fields));
    assert.ok(read.ok);
    assert.equal(read.value.footerCredit, null);
  });

  it("reads a choice of shapes as the shape its choice names", () => {
    const schema = z.object({
      target: z.discriminatedUnion("to", [z.object({ to: z.literal("page"), page: z.string() }), z.object({ to: z.literal("whatsapp"), message: z.string() })]),
    });
    const form = new FormData();
    form.append("target.to", "whatsapp");
    form.append("target.message", "Hi Romaic");
    form.append("target.page", "ignored");
    assert.deepEqual(formValues(schema, form), { target: { to: "whatsapp", message: "Hi Romaic" } });
    assert.equal(schema.safeParse(formValues(schema, withField(form, "target.to", "elsewhere"))).success, false);
  });

  it("puts each problem under the name of the field that has it", () => {
    let fields = formOf(sampleContent().site);
    fields = withField(fields, "address.city", "  ");
    fields = withField(fields, "socialLinks.0.url", "facebook.com/x");
    const read = parseSection("site", formValues(sectionSchemas.site, fields));
    assert.deepEqual(read, {
      ok: false,
      errors: {
        "address.city": "Enter the town or city, like Welkom.",
        "socialLinks.0.url": "Enter your Facebook link starting with https://, like https://www.facebook.com/yourpage.",
      },
    });
  });

  it("lets a default apply when nothing was posted for it", () => {
    const schema = z.object({ focus: z.object({ x: z.number(), y: z.number() }).default(() => ({ x: 50, y: 50 })) });
    assert.deepEqual(schema.parse(formValues(schema, new FormData())), { focus: { x: 50, y: 50 } });
  });
});
