import { createClient } from '@supabase/supabase-js';

function cleanSupabaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return 'https://mzcovvzkwzjvzskjqwwy.supabase.co';
  let url = raw.trim();
  const match = url.match(/^(https?:\/\/[a-zA-Z0-9-]+\.supabase\.co)/i);
  if (match) return match[1];
  if (url.endsWith('/rest/v1/')) url = url.replace('/rest/v1/', '');
  if (url.endsWith('/rest/v1')) url = url.replace('/rest/v1', '');
  return (url.startsWith('http://') || url.startsWith('https://')) ? url : 'https://' + url;
}

let rawUrl = (typeof process !== 'undefined' && process.env?.SUPABASE_URL) || 
             (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 
             (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL);

let SUPABASE_URL = cleanSupabaseUrl(rawUrl);

let SUPABASE_ANON_KEY = (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY);
if (!SUPABASE_ANON_KEY || typeof SUPABASE_ANON_KEY !== 'string' || !SUPABASE_ANON_KEY.trim()) {
  SUPABASE_ANON_KEY = "sb_publishable_Vbd74GKG1eYP7NYp4qtFbg_kuQuDPKv";
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
