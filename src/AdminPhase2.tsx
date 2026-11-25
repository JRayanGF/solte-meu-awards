import { useEffect, useState, useCallback, FormEvent } from 'react'
import { adminClient as sb } from './supabase'
import { errMsg } from './lib'
import { Avatar, Member, squareJpeg } from './photo'

type Cat = { id: string; title: string; pos: number | null }
type Res = { category_id: string; nominee_id: string; member_votes: number; popular_votes: number }

export default function AdminPhase2({ stage, onChange }: { stage: string; onChange: () => void }) {
  const [members, setMembers] = useState<Member[]>([]); const [cats, setCats] = useState<Cat[]>([]); const [res, setRes] = useState<Res[]>([])
  const [sum, setSum] = useState({ member_voters: 0, popular_voters: 0 }); const [err, setErr] = useState('')
  const [name, setName] = useState(''); const [file, setFile] = useState<File | null>(null); const [pw, setPw] = useState('12345')
  const [busy, setBusy] = useState(false); const [fk, setFk] = useState(0)

  const load = useCallback(async () => {
    const [m, c, r, s] = await Promise.all([
      sb.from('members').select('id,name,photo_path').order('created_at'), sb.rpc('phase2_categories'),
      sb.rpc('winner_results'), sb.rpc('winner_summary')])
    const e = m.error || c.error || r.error || s.error
    if (e) return setErr(errMsg(e))
    setMembers(m.data as Member[]); setCats(c.data as Cat[]); setRes(r.data as Res[])
    if (s.data?.[0]) setSum(s.data[0])
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [load])

  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    const n = name.trim().replace(/\s+/g, ' ')
    if (n.length < 2) return setErr('Digite o nome do membro.')
    if (!file) return setErr('Escolha uma foto.')
    if (pw.length < 4) return setErr('A senha precisa ter ao menos 4 caracteres.')
    setBusy(true)
    try {
      const blob = await squareJpeg(file)
      const { data, error } = await sb.from('members').insert({ name: n }).select('id').single()
      if (error) throw error
      const path = `${data.id}.jpg`
      const up = await sb.storage.from('member-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) { await sb.from('members').delete().eq('id', data.id); throw up.error }
      const u = await sb.from('members').update({ photo_path: path }).eq('id', data.id); if (u.error) throw u.error
      const p = await sb.rpc('admin_set_member_password', { p_member: data.id, p_password: pw }); if (p.error) throw p.error
      setName(''); setFile(null); setFk(k => k + 1); setPw('12345'); load()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  async function changePw(m: Member) {
    const v = window.prompt(`Nova senha de ${m.name}:`, '12345'); if (v === null) return
    const { error } = await sb.rpc('admin_set_member_password', { p_member: m.id, p_password: v.trim() })
    setErr(error ? errMsg(error) : '')
  }
  async function remove(m: Member) {
    if (!window.confirm(`Remover ${m.name}? Os votos dele(a) e os votos nele(a) serão apagados.`)) return
    const { error } = await sb.from('members').delete().eq('id', m.id)
    if (error) return setErr(errMsg(error))
    if (m.photo_path) await sb.storage.from('member-photos').remove([m.photo_path])
    load()
  }
  async function setStageTo(s: 'winners_open' | 'winners_closed') {
    if (!window.confirm(s === 'winners_open' ? 'Abrir a votação da fase 2 para todos?' : 'Encerrar a votação da fase 2?')) return
    const { error } = await sb.rpc('set_stage', { p_stage: s })
    if (error) setErr(errMsg(error)); else { setErr(''); onChange() }
  }

  const byId = new Map(members.map(m => [m.id, m]))
  const label: Record<string, string> = { categories_open: 'Fase 1 aberta', categories_closed: 'Fase 1 encerrada', winners_open: 'Fase 2 aberta', winners_closed: 'Fase 2 encerrada' }
  return (
    <section>
      <h2 className="title">Fase 2 — Quem vai ganhar</h2>
      <div className="row actions">
        <span className="pill">{label[stage] ?? stage}</span>
        <button className="gold" onClick={() => setStageTo('winners_open')} disabled={stage === 'categories_open' || stage === 'winners_open'}>{stage === 'winners_closed' ? 'Reabrir fase 2' : 'Abrir votação da fase 2'}</button>
        <button className="danger" onClick={() => setStageTo('winners_closed')} disabled={stage !== 'winners_open'}>Encerrar fase 2</button>
      </div>
      {stage === 'categories_open' && <p className="hint">Encerre a votação da fase 1 para liberar a fase 2.</p>}
      {err && <p className="err" role="alert">{err}</p>}

      <h3 className="sec">Membros do grupo ({members.length})</h3>
      <p className="hint">Cada membro tem login (a senha padrão é 12345) e aparece com a foto nas indicações.</p>
      <form onSubmit={add} className="card addm">
        <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Nome do membro" />
        <input key={fk} type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <input value={pw} onChange={e => setPw(e.target.value)} placeholder="Senha" />
        <button className="gold" disabled={busy}>{busy ? 'Salvando…' : 'Adicionar membro'}</button>
      </form>
      <div className="mlist">
        {members.map(m => (
          <div key={m.id} className="card mrow"><Avatar m={m} size={56} /><b className="grow">{m.name}</b>
            <button className="link sublink" onClick={() => changePw(m)}>Senha</button>
            <button className="link" onClick={() => remove(m)}>Remover</button></div>))}
      </div>

      <h3 className="sec">Resultados</h3>
      <p className="hint">Membros que votaram: {sum.member_voters} · Votantes populares: {sum.popular_voters}</p>
      {cats.map(c => {
        const rows = res.filter(r => r.category_id === c.id).map(r => ({ ...r, total: r.member_votes + r.popular_votes })).sort((a, b) => b.total - a.total)
        return (
          <div key={c.id} className="card resc"><b>{c.title}</b>
            {rows.length === 0 ? <p className="hint">Sem votos ainda.</p> : rows.map((r, i) => (
              <div key={r.nominee_id} className={'rrow' + (i === 0 ? ' lead1' : '')}>
                {byId.get(r.nominee_id) && <Avatar m={byId.get(r.nominee_id)!} size={32} />}
                <span className="grow">{byId.get(r.nominee_id)?.name ?? '—'}</span>
                <small>Grupo {r.member_votes} · Popular {r.popular_votes}</small><b>{r.total}</b>
              </div>))}
          </div>)
      })}
    </section>)
}
