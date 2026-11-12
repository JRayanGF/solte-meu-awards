import { useEffect, useState, FormEvent } from 'react'
import { supabase, configured } from './supabase'
import { norm, errMsg } from './lib'
import Voting, { Participant } from './Voting'
import Admin from './Admin'

export function Brand({ small }: { small?: boolean }) {
  return (
    <div className={'brand' + (small ? ' small' : '')}>
      <svg viewBox="0 0 64 64" aria-hidden="true" className="trophy">
        <path d="M18 8h28v14c0 9-6 16-14 16s-14-7-14-16V8Z" fill="url(#g)" />
        <path d="M18 12H8c0 9 4 15 11 16M46 12h10c0 9-4 15-11 16" fill="none" stroke="url(#g)" strokeWidth="3" />
        <path d="M28 38h8v8h8v6H20v-6h8v-8Z" fill="url(#g)" />
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fbe7a0" /><stop offset="1" stopColor="#b8892b" /></linearGradient></defs>
      </svg>
      <h1><span>SOLTE MEU</span>AWARDS</h1>
    </div>
  )
}

export function Closed() {
  return (
    <main className="stage hero">
      <Brand />
      <div className="card done closed">
        <h2>Votação encerrada</h2>
        <p className="lead">Obrigado por participar do SOLTE MEU AWARDS!</p>
      </div>
    </main>
  )
}

function Register({ onDone }: { onDone: (p: Participant) => void }) {
  const [name, setName] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('')
    const n = norm(name)
    if (n.length < 2 || n.length > 40) return setErr('Digite um nome de 2 a 40 caracteres.')
    setBusy(true)
    const { data, error } = await supabase.from('participants').insert({ name: n }).select('id,name,finalized_at').single()
    setBusy(false)
    if (error) return setErr(error.code === '23505' ? 'Esse nome já está cadastrado. Use outro (ex.: nome + sobrenome).' : errMsg(error))
    onDone(data as Participant)
  }
  return (
    <main className="stage hero">
      <Brand />
      <p className="lead">A premiação mais honesta do grupo. Primeiro, defina as 15 categorias da noite.</p>
      <form onSubmit={submit} className="card register">
        <label htmlFor="n">Seu nome</label>
        <input id="n" value={name} onChange={e => setName(e.target.value)} maxLength={40} autoComplete="given-name" placeholder="Como o pessoal te chama?" autoFocus />
        {err && <p className="err" role="alert">{err}</p>}
        <button className="gold" disabled={busy}>{busy ? 'Entrando…' : 'Entrar na premiação'}</button>
      </form>
    </main>
  )
}

function Setup() {
  return (
    <main className="stage hero"><Brand />
      <div className="card"><p className="err">Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. Veja o README.</p></div>
    </main>
  )
}

function Participante() {
  const [p, setP] = useState<Participant | null>(null)
  const [state, setState] = useState<'load' | 'new' | 'ok' | 'fail' | 'closed'>('load')
  const [err, setErr] = useState('')
  async function boot() {
    setState('load'); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }
      const { data, error } = await supabase.from('participants').select('id,name,finalized_at').maybeSingle()
      if (error) throw error
      if (data) { setP(data as Participant); setState('ok'); return }
      const { data: st, error: e2 } = await supabase.from('app_settings').select('stage').eq('id', 1).single()
      if (e2) throw e2
      setState(st.stage === 'categories_open' ? 'new' : 'closed')
    } catch (e) { setErr(errMsg(e)); setState('fail') }
  }
  useEffect(() => { boot() }, [])
  if (state === 'load') return <main className="stage hero"><Brand /><p className="lead pulse">Abrindo o tapete vermelho…</p></main>
  if (state === 'fail') return <main className="stage hero"><Brand /><div className="card"><p className="err" role="alert">{err}</p><button className="gold" onClick={boot}>Tentar de novo</button></div></main>
  if (state === 'closed') return <Closed />
  if (state === 'new') return <Register onDone={x => { setP(x); setState('ok') }} />
  return <Voting p={p!} onFinal={f => setP({ ...p!, finalized_at: f })} />
}

export default function App() {
  if (!configured) return <Setup />
  return location.pathname.startsWith('/admin') ? <Admin /> : <Participante />
}
