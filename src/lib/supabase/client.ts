import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True once the Supabase URL + anon key are configured; otherwise the app stays local-only. */
export const cloudEnabled = Boolean(url && anonKey);

export const supabase = cloudEnabled ? createClient(url!, anonKey!) : null;
