import { create } from 'zustand';

/** Dialogs that aren't account-specific. `anatomy`: the word whose letters are unthreaded, if any. */
export const useDialogs = create<{ subscribe: boolean; resetProgress: boolean; about: boolean; anatomy: string | null }>(() => ({
  subscribe: false,
  resetProgress: false,
  about: false,
  anatomy: null,
}));
export const openSubscribe = () => useDialogs.setState({ subscribe: true });
export const closeSubscribe = () => useDialogs.setState({ subscribe: false });
export const openResetProgress = () => useDialogs.setState({ resetProgress: true });
export const closeResetProgress = () => useDialogs.setState({ resetProgress: false });
export const openAbout = () => useDialogs.setState({ about: true });
export const closeAbout = () => useDialogs.setState({ about: false });
export const openAnatomy = (slug: string) => useDialogs.setState({ anatomy: slug });
export const closeAnatomy = () => useDialogs.setState({ anatomy: null });
/** Loads the anatomy layer's code (on hover or focus of its button, so a tap opens it at once). */
export const loadAnatomy = () => import('../ui/Anatomy');
