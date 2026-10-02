import type { ReactNode } from 'react';
import { linkHandler } from '../lib/router';
import { topicPath } from '../lib/topics';
import { useDurar } from '../state/store';
import { AccountMenu } from '../ui/AccountMenu';

/**
 * The calm, scrollable surface used by the Library and Privacy pages: the same water and light as
 * the sea, drawn in CSS instead of WebGL so these pages load instantly.
 */
export function PageShell({ back, children }: { back?: string; children: ReactNode }) {
  // By default, back to the part of the sea the visitor was in.
  back ??= topicPath(useDurar.getState().topic);
  return (
    <div className="page">
      <div className="page-light" aria-hidden="true" />
      <header className="page-top">
        <a className="page-back" href={back} onClick={linkHandler(back)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to the sea
        </a>
        <a className="brand" href="/" onClick={linkHandler('/')}>
          <span className="brand-ar" lang="ar">
            دُرَر
          </span>
          <span className="sr-only"> Durar home</span>
        </a>
        <div className="page-account">
          <AccountMenu />
        </div>
      </header>
      <main className="page-main">{children}</main>
    </div>
  );
}
