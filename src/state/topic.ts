import { bootAccounts, useAccount } from '../account/store';
import { TOPIC_KEY } from '../account/storageKeys';
import { navigate } from '../lib/router';
import { isTopic, topicPath } from '../lib/topics';
import { useDurar } from './store';

/**
 * The remembered topic: browser storage for everyone, plus the account (a profile preference) when
 * signed in, so another device opens on the same part of the sea.
 */

export function rememberedTopic(): string | null {
  try {
    const v = localStorage.getItem(TOPIC_KEY);
    return isTopic(v) ? v : null;
  } catch {
    return null;
  }
}

function remember(topic: string | null) {
  try {
    if (topic) localStorage.setItem(TOPIC_KEY, topic);
    else localStorage.removeItem(TOPIC_KEY);
  } catch {
    /* storage blocked: the choice just lasts this visit */
  }
}

async function saveToAccount(topic: string | null) {
  const { status, user } = useAccount.getState();
  if (status !== 'signed-in' || !user || user.topic === topic) return;
  try {
    const backend = await bootAccounts();
    await backend?.setTopic(topic);
    useAccount.setState((s) => (s.user?.id === user.id ? { user: { ...s.user, topic } } : {}));
  } catch {
    /* offline: this browser still remembers it */
  }
}

/** The picker's choice: the sea switches, the address follows (/sea/<topic> or /), and it's remembered. */
export function chooseTopic(topic: string | null) {
  remember(topic);
  if (useDurar.getState().topic !== topic) navigate(topicPath(topic));
  void saveToAccount(topic);
}

// Signing in: an account that has a choice (from another device) sets this browser's for next time;
// an account without one takes this browser's.
useAccount.subscribe((s, prev) => {
  if (!s.user || s.user.id === prev.user?.id) return;
  if (s.user.topic === undefined) {
    const local = rememberedTopic();
    if (local) void saveToAccount(local);
  } else remember(isTopic(s.user.topic) ? s.user.topic : null);
});
