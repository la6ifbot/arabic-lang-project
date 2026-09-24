import { create } from 'zustand';

/** Dialogs that aren't account-specific. */
export const useDialogs = create<{ subscribe: boolean }>(() => ({ subscribe: false }));
export const openSubscribe = () => useDialogs.setState({ subscribe: true });
export const closeSubscribe = () => useDialogs.setState({ subscribe: false });
