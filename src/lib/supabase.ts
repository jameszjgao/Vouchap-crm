import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://giuacjbfsyrristkigmz.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpdWFjamJmc3lycmlzdGtpZ216Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTIyMTQsImV4cCI6MjA4MjkyODIxNH0.siB_aa_Q-XGdg2dMDDzMu1yjsXJtIcEm2-SDNsRomNk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
