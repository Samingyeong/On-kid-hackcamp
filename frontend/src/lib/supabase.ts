import { createClient } from '@supabase/supabase-js'

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const configuredSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = Boolean(configuredSupabaseUrl && configuredSupabaseAnonKey)

export const supabase = createClient(
  configuredSupabaseUrl || 'https://example.supabase.co',
  configuredSupabaseAnonKey || 'demo-anon-key'
)
