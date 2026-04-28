/**
 * legal.ts — privacy / terms link tests.
 *
 * The protin.app fallbacks were removed because they 404 in production. The
 * module now reads `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` at
 * load time and `openLegal` either opens the URL or surfaces a clear
 * "not configured" Alert so internal builds never silently send users to
 * a broken page.
 */

import { Alert, Linking } from 'react-native';

describe('legal links', () => {
  // ── env-provided URLs ────────────────────────────────────────────────────

  describe('with env vars set', () => {
    let openLegal: typeof import('../lib/legal').openLegal;
    let PRIVACY_URL: string | null;
    let TERMS_URL: string | null;
    let LEGAL_LINKS_CONFIGURED: boolean;
    let openURLSpy: jest.SpyInstance;
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.resetModules();
      process.env.EXPO_PUBLIC_PRIVACY_URL = 'https://example.com/privacy';
      process.env.EXPO_PUBLIC_TERMS_URL = 'https://example.com/terms';
      const mod = require('../lib/legal');
      openLegal = mod.openLegal;
      PRIVACY_URL = mod.PRIVACY_URL;
      TERMS_URL = mod.TERMS_URL;
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
      expect(LEGAL_LINKS_CONFIGURED).toBe(true);
    });

    it('opens the configured URL in the browser', () => {
      openLegal(PRIVACY_URL, 'Privacy Policy');
      expect(openURLSpy).toHaveBeenCalledWith('https://example.com/privacy');
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('does not hardcode protin.app URLs', () => {
      // Regression: the previous build shipped https://protin.app/{terms,privacy}
      // which 404 in production. Make sure those literals never come back as
      // a silent fallback when env vars are present.
      expect(PRIVACY_URL).not.toContain('protin.app');
      expect(TERMS_URL).not.toContain('protin.app');
    });
  });

  // ── unset env vars (internal builds, dev) ────────────────────────────────

  describe('with env vars unset', () => {
    let openLegal: typeof import('../lib/legal').openLegal;
    let PRIVACY_URL: string | null;
    let TERMS_URL: string | null;
    let LEGAL_LINKS_CONFIGURED: boolean;
    let openURLSpy: jest.SpyInstance;
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.resetModules();
      delete process.env.EXPO_PUBLIC_PRIVACY_URL;
      delete process.env.EXPO_PUBLIC_TERMS_URL;
      const mod = require('../lib/legal');
      openLegal = mod.openLegal;
      PRIVACY_URL = mod.PRIVACY_URL;
      TERMS_URL = mod.TERMS_URL;
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
      expect(LEGAL_LINKS_CONFIGURED).toBe(false);
    });

    it('shows a not-configured Alert and does not open any URL', () => {
      openLegal(PRIVACY_URL, 'Privacy Policy');
      expect(openURLSpy).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, message] = alertSpy.mock.calls[0];
      expect(title).toBe('Privacy Policy not available');
      expect(message).toMatch(/EXPO_PUBLIC_PRIVACY_URL/);
      expect(message).toMatch(/EXPO_PUBLIC_TERMS_URL/);
    });
  });
});
