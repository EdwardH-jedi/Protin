/**
 * legal.ts — privacy / terms / support link tests.
 *
 * The module reads `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, and
 * `EXPO_PUBLIC_SUPPORT_URL` at load time. `openLegal` either opens the
 * URL (after a plausible-http-URL sanity check) or surfaces a small
 * "not available yet" Alert so internal builds and malformed URLs never
 * silently send users to a broken page or crash the screen.
 */

import { Alert, Linking } from 'react-native';

describe('legal links', () => {
  // ── env-provided URLs ────────────────────────────────────────────────────

  describe('with env vars set', () => {
    let openLegal: typeof import('../lib/legal').openLegal;
    let PRIVACY_URL: string | null;
    let TERMS_URL: string | null;
    let SUPPORT_URL: string | null;
    let LEGAL_LINKS_CONFIGURED: boolean;
    let openURLSpy: jest.SpyInstance;
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.resetModules();
      process.env.EXPO_PUBLIC_PRIVACY_URL = 'https://example.com/privacy';
      process.env.EXPO_PUBLIC_TERMS_URL = 'https://example.com/terms';
      process.env.EXPO_PUBLIC_SUPPORT_URL = 'https://example.com/support';
      const mod = require('../lib/legal');
      openLegal = mod.openLegal;
      PRIVACY_URL = mod.PRIVACY_URL;
      TERMS_URL = mod.TERMS_URL;
      SUPPORT_URL = mod.SUPPORT_URL;
      LEGAL_LINKS_CONFIGURED = mod.LEGAL_LINKS_CONFIGURED;
      openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    afterEach(() => {
      openURLSpy.mockRestore();
      alertSpy.mockRestore();
    });

    it('exposes the configured URLs', () => {
      expect(PRIVACY_URL).toBe('https://example.com/privacy');
      expect(TERMS_URL).toBe('https://example.com/terms');
      expect(SUPPORT_URL).toBe('https://example.com/support');
      expect(LEGAL_LINKS_CONFIGURED).toBe(true);
    });

    it('opens the privacy URL in the browser', () => {
      openLegal(PRIVACY_URL, 'Privacy Policy');
      expect(openURLSpy).toHaveBeenCalledWith('https://example.com/privacy');
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('opens the terms URL in the browser', () => {
      openLegal(TERMS_URL, 'Terms of Service');
      expect(openURLSpy).toHaveBeenCalledWith('https://example.com/terms');
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('opens the support URL in the browser', () => {
      openLegal(SUPPORT_URL, 'Support');
      expect(openURLSpy).toHaveBeenCalledWith('https://example.com/support');
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('does not hardcode protin.app URLs', () => {
      // Regression: the previous build shipped https://protin.app/{terms,privacy}
      // which 404 in production. Make sure those literals never come back as
      // a silent fallback when env vars are present.
      expect(PRIVACY_URL).not.toContain('protin.app');
      expect(TERMS_URL).not.toContain('protin.app');
      expect(SUPPORT_URL).not.toContain('protin.app');
    });
  });

  // ── unset env vars (internal builds, dev) ────────────────────────────────

  describe('with env vars unset', () => {
    let openLegal: typeof import('../lib/legal').openLegal;
    let PRIVACY_URL: string | null;
    let TERMS_URL: string | null;
    let SUPPORT_URL: string | null;
    let LEGAL_LINKS_CONFIGURED: boolean;
    let openURLSpy: jest.SpyInstance;
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.resetModules();
      delete process.env.EXPO_PUBLIC_PRIVACY_URL;
      delete process.env.EXPO_PUBLIC_TERMS_URL;
      delete process.env.EXPO_PUBLIC_SUPPORT_URL;
      const mod = require('../lib/legal');
      openLegal = mod.openLegal;
      PRIVACY_URL = mod.PRIVACY_URL;
      TERMS_URL = mod.TERMS_URL;
      SUPPORT_URL = mod.SUPPORT_URL;
      LEGAL_LINKS_CONFIGURED = mod.LEGAL_LINKS_CONFIGURED;
      openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    afterEach(() => {
      openURLSpy.mockRestore();
      alertSpy.mockRestore();
    });

    it('exposes null URLs and a configured=false flag', () => {
      expect(PRIVACY_URL).toBeNull();
      expect(TERMS_URL).toBeNull();
      expect(SUPPORT_URL).toBeNull();
      expect(LEGAL_LINKS_CONFIGURED).toBe(false);
    });

    it('shows a not-available Alert and does not open any URL', () => {
      openLegal(PRIVACY_URL, 'Privacy Policy');
      expect(openURLSpy).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, message] = alertSpy.mock.calls[0];
      expect(title).toBe('Privacy Policy not available');
      expect(message).toMatch(/not available yet/i);
    });

    it('shows a Support-labelled Alert when SUPPORT_URL is missing', () => {
      openLegal(SUPPORT_URL, 'Support');
      expect(openURLSpy).not.toHaveBeenCalled();
      const [title] = alertSpy.mock.calls[0];
      expect(title).toBe('Support not available');
    });
  });

  // ── malformed URLs (defensive) ───────────────────────────────────────────

  describe('with a malformed URL', () => {
    let openLegal: typeof import('../lib/legal').openLegal;
    let openURLSpy: jest.SpyInstance;
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.resetModules();
      delete process.env.EXPO_PUBLIC_PRIVACY_URL;
      delete process.env.EXPO_PUBLIC_TERMS_URL;
      delete process.env.EXPO_PUBLIC_SUPPORT_URL;
      ({ openLegal } = require('../lib/legal'));
      openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    afterEach(() => {
      openURLSpy.mockRestore();
      alertSpy.mockRestore();
    });

    it('rejects a non-http URL and surfaces the not-available Alert', () => {
      openLegal('javascript:alert(1)', 'Privacy Policy');
      expect(openURLSpy).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects a string that is not a URL at all', () => {
      openLegal('not-a-url', 'Terms of Service');
      expect(openURLSpy).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });
  });
});
