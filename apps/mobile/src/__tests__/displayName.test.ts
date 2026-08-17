import {
  DISPLAY_NAME_HELPER_TEXT,
  sanitizeDisplayName,
} from '../lib/displayName';

describe('sanitizeDisplayName', () => {
  it('passes the full English allowlist through unchanged', () => {
    expect(sanitizeDisplayName("Jordan O'Brien-Lee Jr. 1985")).toBe(
      "Jordan O'Brien-Lee Jr. 1985"
    );
  });

  it('strips Korean and other CJK characters', () => {
    expect(sanitizeDisplayName('\uAE40\uBBFC\uC218Jordan')).toBe('Jordan');
    expect(sanitizeDisplayName('\u5C71\u7530Jordan\u592A\u90CE')).toBe('Jordan');
  });

  it('strips emoji and punctuation outside the allowlist', () => {
    expect(sanitizeDisplayName('Jordan 🎾 Lee!@#')).toBe('Jordan  Lee');
    expect(sanitizeDisplayName('Müller')).toBe('Mller');
  });
});

describe('DISPLAY_NAME_HELPER_TEXT', () => {
  it('mentions the four punctuation characters allowed', () => {
    // The screen copies must stay in sync with the regex; pin the chars.
    expect(DISPLAY_NAME_HELPER_TEXT).toContain('-');
    expect(DISPLAY_NAME_HELPER_TEXT).toContain("'");
    expect(DISPLAY_NAME_HELPER_TEXT).toContain('.');
  });
});
