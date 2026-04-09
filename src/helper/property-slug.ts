/**
 * SEO-friendly public URLs: `/property/{slug}-{id}` (e.g. `/property/3BHK-20Duplex-house-42`).
 * API calls use the numeric/string id only — parse it with {@link parsePropertyIdFromSlugParam}.
 */

/** Turn a listing title into a URL-safe segment (letters, digits, hyphens). */
export function slugifyPropertyTitle(title: string): string {
  const s = title
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "listing";
}

/**
 * Full pathname for a property detail page. Always ends with `-{id}` so the id can be parsed.
 */
export function buildPropertyPath(id: string | number, title?: string | null): string {
  const idStr = String(id).trim();
  const slug = slugifyPropertyTitle(title ?? "");
  return `/property/${slug}-${idStr}`;
}

/**
 * Extract the property id from the `[slug]` route param for backend requests.
 * Supports `/property/123` (legacy) and `/property/my-title-123`.
 */
export function parsePropertyIdFromSlugParam(param: string): string | null {
  const t = decodeURIComponent(param).trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return t;
  const parts = t.split("-");
  const last = parts[parts.length - 1] ?? "";
  if (/^\d+$/.test(last)) return last;
  return null;
}
