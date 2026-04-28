import { useState } from 'react';
import { Modal } from '@/components/Modal';
import {
  ContactContent,
  PrivacyContent,
  TermsContent,
} from '@/content/legal';

type LegalKey = 'privacy' | 'terms' | 'contact';

const LEGAL_TITLES: Record<LegalKey, string> = {
  privacy: 'Privacy Policy (draft)',
  terms: 'Terms of Service (draft)',
  contact: 'Contact Protin',
};

/**
 * Site footer. The Privacy / Terms / Contact links open accessible
 * dialogs instead of the previous dead `#` anchors. This avoids adding
 * a router (heavy for three small pages) but keeps the surfaces real.
 */
export function SiteFooter() {
  const [open, setOpen] = useState<LegalKey | null>(null);

  const renderModalContent = () => {
    switch (open) {
      case 'privacy':
        return <PrivacyContent />;
      case 'terms':
        return <TermsContent />;
      case 'contact':
        return <ContactContent />;
      default:
        return null;
    }
  };

  return (
    <footer className="relative z-10 mt-24 border-t border-white/10 py-8">
      <div className="container mx-auto px-4 text-center text-sm text-slate-400 sm:px-6 lg:px-8">
        <p>
          © {new Date().getFullYear()} Protin. Building the future of fitness
          connections.
        </p>
        <nav
          aria-label="Legal and contact"
          className="mt-2 flex items-center justify-center gap-2 text-xs"
        >
          <button
            type="button"
            onClick={() => setOpen('privacy')}
            className="rounded px-1.5 py-1 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Privacy
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setOpen('terms')}
            className="rounded px-1.5 py-1 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Terms
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setOpen('contact')}
            className="rounded px-1.5 py-1 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Contact
          </button>
        </nav>
      </div>

      <Modal
        open={open !== null}
        title={open ? LEGAL_TITLES[open] : ''}
        onClose={() => setOpen(null)}
      >
        {renderModalContent()}
      </Modal>
    </footer>
  );
}
