import { create } from 'zustand';
import { bootAccounts, useAccount } from '../account/store';

/** Whether the signed-in user has joined The Deep (null: not known yet), for the menu and the Library. */
export const useDeepMember = create<{ joined: boolean | null; user: string | null }>(() => ({ joined: null, user: null }));

let loading: Promise<void> | null = null;

export function loadDeepMembership() {
  const user = useAccount.getState().user?.id ?? null;
  if (!user || (useDeepMember.getState().user === user && useDeepMember.getState().joined !== null)) return loading ?? Promise.resolve();
  loading ??= bootAccounts()
    .then((b) => b?.deepMe())
    .then((me) => useDeepMember.setState({ joined: me != null, user }))
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

export const setDeepMember = (joined: boolean) => useDeepMember.setState({ joined, user: useAccount.getState().user?.id ?? null });
