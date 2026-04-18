/**
 * Centralised brand tokens for transactional emails.
 *
 * Used sparingly — only on primary CTAs, a single accent on the pickup stop,
 * and hyperlink colors. Status-specific colors (success green, danger red,
 * neutral dark) are left intact on purpose because they carry semantic
 * meaning that shouldn't be overridden by the brand hue.
 *
 * If marketing ever rebrands, change this file and every transactional email
 * picks up the new color without touching the templates.
 */

/** Site theme color. Must be a hex literal — email clients don't evaluate
 * CSS variables. */
export const BRAND_COLOR = '#007a55';

/** Optional foreground for text placed on top of {@link BRAND_COLOR}. */
export const BRAND_ON_COLOR = '#ffffff';
