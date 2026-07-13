import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = 
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('YOUR_PROJECT_ID') && 
  !supabaseAnonKey.includes('your_anon_key_here') && 
  !supabaseAnonKey.includes('your_supabase_anon_key_here');

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

