import { create } from 'zustand';

/** Dialogs that aren't account-specific. */
export const useDialogs = create<{ subscribe: boolean; resetProgress: boolean; about: boolean }>(() => ({
  subscribe: false,
  resetProgress: false,
  about: false,
}));
export const openSubscribe = () => useDialogs.setState({ subscribe: true });
export const closeSubscribe = () => useDialogs.setState({ subscribe: false });
export const openResetProgress = () => useDialogs.setState({ resetProgress: true });
export const closeResetProgress = () => useDialogs.setState({ resetProgress: false });
export const openAbout = () => useDialogs.setState({ about: true });
export const closeAbout = () => useDialogs.setState({ about: false });
