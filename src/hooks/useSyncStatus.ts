import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { cloudEnabled } from '../lib/supabase/client';
import { getLastSync, SYNC_EVENT } from '../lib/supabase/sync';

export type SyncState = 'local' | 'offline' | 'syncing' | 'synced';

/** Whether this device's changes have reached the cloud. */
export function useSyncStatus(): { state: SyncState; lastSync: string | null } {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [lastSync, setLastSync] = useState(getLastSync);
  const pending = useLiveQuery(() => db.outbox.count(), [], 0);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    const synced = () => setLastSync(getLastSync());
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    window.addEventListener(SYNC_EVENT, synced);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.removeEventListener(SYNC_EVENT, synced);
    };
  }, []);

  if (!cloudEnabled) return { state: 'local', lastSync };
  if (!online) return { state: 'offline', lastSync };
  if (pending > 0) return { state: 'syncing', lastSync };
  return { state: 'synced', lastSync };
}
