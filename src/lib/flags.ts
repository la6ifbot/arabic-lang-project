declare const __EMAIL_SIGNUP__: boolean;

declare global {
  interface Window {
    /** Test hook: overrides the build-time email sign-up flag. */
    __DURAR_EMAIL_SIGNUP__?: boolean;
  }
}

/** Whether the “Pearl of the Day by email” UI is shown (see shared/flags.ts). */
export const emailSignupEnabled: boolean =
  typeof window !== 'undefined' && typeof window.__DURAR_EMAIL_SIGNUP__ === 'boolean'
    ? window.__DURAR_EMAIL_SIGNUP__
    : __EMAIL_SIGNUP__;
