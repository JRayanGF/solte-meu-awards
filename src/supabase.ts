import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const configured = Boolean(url && key)

const make = (storageKey: string) =>
  createClient(url ?? 'http://localhost', key ?? 'missing', { auth: { storageKey, persistSession: true, autoRefreshToken: true } })

/** Sessão anônima dos participantes (persistida no navegador). */
export const supabase = make('sma-participant')
/** Sessão separada do administrador (não interfere na do participante). */
export const adminClient = make('sma-admin')
