export const MAX = 15
export const norm = (s: string) => s.trim().replace(/\s+/g, ' ')
export function errMsg(e: unknown): string {
  const x = e as { message?: string; code?: string }
  const m = x?.message ?? String(e)
  if (x?.code === '23505') return 'Esse nome já está cadastrado.'
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.'
  if (/anonymous/i.test(m)) return 'Login anônimo desativado no Supabase. Ative em Authentication > Sign In / Providers > Anonymous.'
  return m
}
