import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { errMsg } from './lib'
import { Brand } from './App'
import { Avatar, Framed, Member, NameTag } from './photo'

type Db = typeof supabase
type Cat = { id: string; title: string; pos: number | null; honorary: boolean }
const FLAG = 'sma-popular'
const getFlag = (k: string) => { try { return localStorage.getItem(k) === '1' } catch { return false } }
const setFlag = (k: string, v: boolean) => { try { if (v) localStorage.setItem(k, '1'); else localStorage.removeItem(k) } catch { /* ignora */ } }

function Login({ db, members, onMember, onPopular }: { db: Db; members: Member[]; onMember: () => void; onPopular: () => void }) {
  const [who, setWho] = useState<Member | null>(null); const [pw, setPw] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function enter(e: React.FormEvent) {
    e.preventDefault(); if (!who) return
    setBusy(true); setErr('')
    const { error } = await db.rpc('member_login', { p_member: who.id, p_password: pw })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onMember()
  }
  return (
    <main className="stage">
      <div className="hero2"><Brand /></div>
      <h2 className="title">Quem é você?</h2>
      <p className="lead">Se você é do grupo, escolha seu perfil. Se não, vote como popular.</p>
      <div className="members">
        {members.map(m => (
          <button key={m.id} className={'mem' + (who?.id === m.id ? ' on' : '')} onClick={() => { setWho(m); setPw(''); setErr('') }}>
            <Framed m={m} /><NameTag m={m} />
          </button>))}
      </div>
      {who && (
        <form onSubmit={enter} className="card register" style={{ margin: '1rem auto' }}>
          <label htmlFor="pw">Senha de {who.name}</label>
          <input id="pw" type="password" inputMode="numeric" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
          {err && <p className="err" role="alert">{err}</p>}
          <button className="gold" disabled={busy || !pw}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>)}
      <div className="or"><span>ou</span></div>
      <button className="ghost wide" onClick={onPopular}>Votar como popular (sem login)</button>
    </main>)
}

export default function Phase2({ client = supabase, test = false }: { client?: Db; test?: boolean }) {
  const db = client; const fk = test ? 'sma-popular-test' : FLAG
  const [members, setMembers] = useState<Member[]>([]); const [cats, setCats] = useState<Cat[]>([])
  const [votes, setVotes] = useState<Record<string, string>>({}); const [me, setMe] = useState<string | null>(null)
  const [mode, setMode] = useState<'load' | 'login' | 'vote'>('load'); const [err, setErr] = useState('')
  const [cur, setCur] = useState<string | null>(null); const [pick, setPick] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [m, c, v, s] = await Promise.all([
      db.from('members').select('id,name,photo_path,nickname,honorary').order('created_at'),
      db.rpc('phase2_categories'),
      db.from('winner_votes').select('category_id,nominee_id'),
      db.from('member_sessions').select('member_id').maybeSingle()])
    const e = m.error || c.error || v.error || s.error
    if (e) return setErr(errMsg(e))
    setMembers(m.data as Member[]); setCats(c.data as Cat[])
    setVotes(Object.fromEntries((v.data ?? []).map(r => [r.category_id as string, r.nominee_id as string])))
    const mid = (s.data?.member_id as string | undefined) ?? null
    setMe(mid); setMode(mid || getFlag(fk) ? 'vote' : 'login')
  }, [db, fk])
  useEffect(() => { load() }, [load])

  async function leave() {
    if (me && test) { await db.rpc('member_logout'); setFlag(fk, false); setMe(null); setMode('login') }
    else if (me) { await db.auth.signOut(); setFlag(fk, false); location.reload() }
    else { setFlag(fk, false); setMode('login') }
  }
  async function confirmVote() {
    if (!cur || !pick) return
    setBusy(true); setErr('')
    const { error } = await db.rpc('cast_vote', { p_category: cur, p_nominee: pick.id })
    setBusy(false)
    if (error) { setPick(null); setErr(errMsg(error)); if (/já votou/.test(error.message)) load(); return }
    const nv = { ...votes, [cur]: pick.id }; setVotes(nv); setPick(null)
    const i = cats.findIndex(c => c.id === cur)
    setCur([...cats.slice(i + 1), ...cats.slice(0, i)].find(c => !nv[c.id])?.id ?? null)
  }

  if (mode === 'load') return <main className="stage hero"><Brand />{err ? <p className="err" role="alert">{err}</p> : <p className="lead pulse">Carregando…</p>}</main>
  const regular = members.filter(m => !m.honorary); const honor = members.filter(m => m.honorary)
  if (!regular.length || !cats.length) return <main className="stage hero"><Brand /><p className="lead">A votação ainda não foi configurada. Volte em instantes.</p></main>
  if (mode === 'login') return <Login db={db} members={regular} onMember={load} onPopular={() => { setFlag(fk, true); setMode('vote') }} />

  const byId = new Map(members.map(m => [m.id, m])); const meM = me ? byId.get(me) : null
  const done = cats.filter(c => votes[c.id]).length; const all = done === cats.length
  const cat = cats.find(c => c.id === cur)
  const head = (
    <header className="top">
      <div className="who2">{meM ? <><Avatar m={meM} size={34} /><span>{meM.name}</span></> : <span>Voto popular</span>}</div>
      <button className="link sublink" onClick={leave}>Trocar perfil</button>
    </header>)

  if (cat && !all) return (
    <main className="stage">{head}
      <button className="link sublink" onClick={() => setCur(null)}>← Indicações</button>
      <div className="ind">
        <small>Indicação {cats.findIndex(c => c.id === cat.id) + 1} de {cats.length}</small>
        <h2>{cat.title}</h2>
        <p>Quem merece ganhar? Toque na foto.</p>
      </div>
      <div className="members">
        {(cat.honorary ? honor : regular).map(m => <button key={m.id} className="mem" onClick={() => setPick(m)}><Framed m={m} /><NameTag m={m} /></button>)}
      </div>
      {cat.honorary && honor.length === 0 && <p className="err">Os indicados desta categoria ainda não foram definidos.</p>}
      {err && <p className="err" role="alert">{err}</p>}
      {pick && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="bigframe"><Framed m={pick} /></div>
            <h3>Votar em {pick.name}?</h3>{pick.nickname && <p className="nick2">{pick.nickname}</p>}
            <p className="indm">{cat.title}</p>
            <p className="hint">Depois de confirmar, não dá para mudar.</p>
            <div className="row"><button className="ghost" onClick={() => setPick(null)}>Voltar</button><button className="gold" onClick={confirmVote} disabled={busy}>{busy ? 'Salvando…' : 'Confirmar'}</button></div>
          </div>
        </div>)}
    </main>)

  return (
    <main className="stage">{head}
      <h2 className="title">{all ? 'Votação concluída!' : 'Indicações'}</h2>
      <p className="lead">{all ? 'Obrigado por votar em todas as indicações.' : `${done}/${cats.length} votadas. Toque numa indicação para votar.`}</p>
      {err && <p className="err" role="alert">{err}</p>}
      <ul className="cats">
        {cats.map(c => { const v = votes[c.id] ? byId.get(votes[c.id]) : null; return (
          <li key={c.id}><button className={'cat catbtn' + (v ? ' on' : '')} disabled={!!v} onClick={() => { setErr(''); setCur(c.id) }}>
            <span className="box" aria-hidden="true">✓</span><span className="grow">{c.title}</span>{v && <small className="sub">{v.name}</small>}
          </button></li>) })}
      </ul>
    </main>)
}
