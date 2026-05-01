/**
 * Display-name input sanitizer.
 *
 * V1 SportsGang ships English-only display names. The allowlist is
 * deliberately tight — A–Z, a–z, 0–9, space, hyphen, apostrophe, dot —
 * because the discovery feed, chat, and partner cards render these names
 * directly and we want predictable rendering across iOS / Android system
 * fonts without falling back to glyphs that ship inconsistently.
 *
 * Sanitization runs on every keystroke via the input's `onChangeText`,
 * not at submit time, so the field visibly rejects disallowed characters
 * as the user types. Trimming and length checks remain at submit time.
 *
 * Trade-offs for V1:
 *   - Names with diacritics (José, Müller) get stripped to their ASCII
 *     skeletons (Jos, Mller). Acceptable for V1 launch; revisit if/when
 *     we localise.
 *   - Existing profiles created with CJK / non-Latin names still render
 *     correctly because sanitization fires only on edit. The first
 *     keystroke in Edit Profile re-sanitizes and drops prior chars —
 *     surface this in release notes.
 */

// Allowlist regex — anything NOT in [A-Za-z0-9 .'-] is stripped.
// Hyphen sits at the end of the class so it stays literal without escaping.
const DISALLOWED = /[^A-Za-z0-9 .'-]/g;

export function sanitizeDisplayName(input: string): string {
  return input.replace(DISALLOWED, '');
}

// Single source of truth for the user-facing helper line. Screens import
// this so the rule and the message can never drift out of sync.
export const DISPLAY_NAME_HELPER_TEXT =
  "Use English letters, numbers, spaces, - ' . only.";
