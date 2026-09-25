import { create } from 'zustand';

/** Dialogs that aren't account-specific. */
export const useDialogs = create<{ subscribe: boolean; resetProgress: boolean }>(() => ({ subscribe: false, resetProgress: false }));
export const openSubscribe = () => useDialogs.setState({ subscribe: true });
export const closeSubscribe = () => useDialogs.setState({ subscribe: false });
export const openResetProgress = () => useDialogs.setState({ resetProgress: true });
export const closeResetProgress = () => useDialogs.setState({ resetProgress: false });
