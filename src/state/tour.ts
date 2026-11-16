import { create } from 'zustand';

/**
 * The first-time walk-through of the card (src/ui/Tour.tsx). It starts by itself on a first visit
 * (in place of the “How it works” box), and again from “Show me around” in that box.
 */
export const useTour = create<{ open: boolean }>(() => ({ open: false }));
export const startTour = () => useTour.setState({ open: true });
export const endTour = () => useTour.setState({ open: false });
/** Loads the walk-through's code ahead of time (it is its own small chunk). */
export const loadTour = () => import('../ui/Tour');
