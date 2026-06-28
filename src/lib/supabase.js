// src/lib/supabase.js
// Creates the single Supabase client the whole app uses to read/write data.
// The URL and key are pulled from environment variables (set in .env.local
// locally and in the Vercel dashboard for production) — never hardcoded here.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
