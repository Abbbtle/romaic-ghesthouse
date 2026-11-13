/**
 * Conditional GETs (RFC 9110 §13.1.2) for the endpoints that label their
 * responses with an ETag (/api/availability, the calendar feed): a client
 * that sends back the tag of a copy that's still current gets a 304.
 */

/**
 * Whether an If-None-Match header names `etag`. It's compared weakly, since
 * a CDN that compresses the body marks the tag W/, and "*" names any
 * current response.
 */
export function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (header === null) return false;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, "");
  const wanted = opaque(etag);
  return header.split(",").some((tag) => tag.trim() === "*" || opaque(tag) === wanted);
}
