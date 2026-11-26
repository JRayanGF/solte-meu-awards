import { useEffect, useState, useCallback, FormEvent } from 'react'
import { adminClient as sb } from './supabase'
import { errMsg } from './lib'
import { Avatar, Member, squareJpeg } from './photo'
import Reveal from './Reveal'

type Cat = { id: string; title: string; pos: number | null; honorary: boolean }
type Row = { key: string; label: string; m?: Member; a: number; b: number }
type Res = { category_id: string; nominee_id: string; member_votes: number; popular_votes: number }

function Bars({ rows, max }: { rows: Row[]; max?: number }) {
  const mx = max ?? Math.max(1, ...rows.map(r => r.a + r.b))
  return (
    <div className="hbars">
      {rows.map((r, i) => (
        <div key={r.key} className={'hb' + (i === 0 && r.a + r.b > 0 ? ' top' : '')}>
          <div className="bl">{r.m && <Avatar m={r.m} size={26} />}<span title={r.label}>{r.label}</span></div>
          <div className="bt"><i className="seg g" style={{ width: `${(r.a / mx) * 100}%` }} /><i className="seg p" style={{ width: `${(r.b / mx) * 100}%` }} /></div>
          <b className="bn">{r.a + r.b}</b>
        </div>))}
    </div>)
}

export default function AdminPhase2({ stage, onChange }: { stage: string; onChange: () => void }) {
  const [members, setMembers] = useState<Member[]>([]); const [cats, setCats] = useState<Cat[]>([]); const [res, setRes] = useState<Res[]>([])
  const [sum, setSum] = useState({ member_voters: 0, popular_voters: 0 }); const [err, setErr] = useState('')
  const [name, setName] = useState(''); const [file, setFile] = useState<File | null>(null); const [pw, setPw] = useState('12345')
  const [busy, setBusy] = useState(false); const [fk, setFk] = useState(0)
  const [show, setShow] = useState(false)
  const [tab, setTab] = useState<'m' | 'a' | 'h'>('m');
  const [hd, setHd] = useState<Record<string, { name?: string; nick?: string; file?: File }>>({})
  const [empties, setEmpties] = useState<string[]>(['n1', 'n2', 'n3', 'n4', 'n5']); const [nid, setNid] = useState(6)
  const [nicks, setNicks] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const [m, c, r, s] = await Promise.all([
      sb.from('members').select('id,name,photo_path,nickname,honorary').order('created_at'), sb.rpc('phase2_categories'),
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
  async function changePhoto(m: Member, f?: File) {
    if (!f) return
    setErr(''); setBusy(true)
    try {
      const blob = await squareJpeg(f); const path = `${m.id}-${Date.now()}.jpg`
      const up = await sb.storage.from('member-photos').upload(path, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error
      const u = await sb.from('members').update({ photo_path: path }).eq('id', m.id); if (u.error) throw u.error
      if (m.photo_path) await sb.storage.from('member-photos').remove([m.photo_path])
      load()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  async function saveNicks() {
    setErr(''); setBusy(true)
    try {
      for (const [id, v] of Object.entries(nicks)) {
        const t = v.trim().replace(/\s+/g, ' ')
        const { error } = await sb.from('members').update({ nickname: t || null }).eq('id', id); if (error) throw error
      }
      setNicks({}); load()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const patchHd = (k: string, v: { name?: string; nick?: string; file?: File }) => setHd(d => ({ ...d, [k]: { ...d[k], ...v } }))
  async function saveHonor(key: string, ex?: Member) {
    const d = hd[key] ?? {}
    const nm = (d.name ?? ex?.name ?? '').trim().replace(/\s+/g, ' ')
    const nick = (d.nick ?? ex?.nickname ?? '').trim().replace(/\s+/g, ' ') || null
    if (nm.length < 2) return setErr('Digite o nome do indicado.')
    setErr(''); setBusy(true)
    try {
      let id = ex?.id
      if (!id) {
        const { data, error } = await sb.from('members').insert({ name: nm, nickname: nick, honorary: true }).select('id').single()
        if (error) throw error
        id = data.id as string
      } else {
        const { error } = await sb.from('members').update({ name: nm, nickname: nick }).eq('id', id); if (error) throw error
      }
      if (d.file) {
        const blob = await squareJpeg(d.file); const path = `${id}-${Date.now()}.jpg`
        const up = await sb.storage.from('member-photos').upload(path, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error
        const u = await sb.from('members').update({ photo_path: path }).eq('id', id); if (u.error) throw u.error
        if (ex?.photo_path) await sb.storage.from('member-photos').remove([ex.photo_path])
      }
      setHd(({ [key]: _gone, ...rest }) => rest)
      if (!ex) setEmpties(l => l.filter(x => x !== key))
      load()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  async function setHonorCat(v: string) {
    const { error } = await sb.rpc('admin_set_honorary_category', { p_category: v || null })
    if (error) setErr(errMsg(error)); else { setErr(''); load() }
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
  async function finishTest() {
    if (!window.confirm('Finalizar o teste? TODOS os votos de teste serão apagados e a votação volta ao estado inicial.')) return
    const { error } = await sb.rpc('finish_test')
    if (error) setErr(errMsg(error)); else { setErr(''); load(); onChange() }
  }
  async function setStageTo(s: 'winners_test' | 'winners_open' | 'winners_closed') {
    const q = { winners_test: 'Abrir a votação só para teste? Os participantes verão “Em breve” e só você vota, pela tela de teste.', winners_open: 'Abrir a votação da fase 2 para todos?', winners_closed: 'Encerrar a votação da fase 2?' }[s]
    if (!window.confirm(q)) return
    const { error } = await sb.rpc('set_stage', { p_stage: s })
    if (error) setErr(errMsg(error)); else { setErr(''); onChange() }
  }

  const regular = members.filter(m => !m.honorary); const honor = members.filter(m => m.honorary)
  const tot = new Map<string, { a: number; b: number }>()
  res.forEach(r => { const t = tot.get(r.nominee_id) ?? { a: 0, b: 0 }; t.a += r.member_votes; t.b += r.popular_votes; tot.set(r.nominee_id, t) })
  const overall: Row[] = regular.map(m => ({ key: m.id, label: m.name, m, a: tot.get(m.id)?.a ?? 0, b: tot.get(m.id)?.b ?? 0 }))
    .sort((x, y) => (y.a + y.b) - (x.a + x.b))
  const perCat: Row[] = cats.map(c => {
    const rs = res.filter(r => r.category_id === c.id)
    return { key: c.id, label: c.title, a: rs.reduce((n, r) => n + r.member_votes, 0), b: rs.reduce((n, r) => n + r.popular_votes, 0) }
  })
  const leaders = cats.map(c => {
    const rs = res.filter(r => r.category_id === c.id).map(r => ({ id: r.nominee_id, t: r.member_votes + r.popular_votes }))
    const top = Math.max(0, ...rs.map(r => r.t))
    const names = top ? rs.filter(r => r.t === top).map(r => members.find(m => m.id === r.id)?.name ?? '—').join(' / ') : 'Sem votos'
    return { key: c.id, title: c.title, names, votes: top }
  })
  const label: Record<string, string> = { categories_open: 'Fase 1 aberta', categories_closed: 'Fase 1 encerrada', winners_test: 'Fase 2 em TESTE', winners_open: 'Fase 2 aberta', winners_closed: 'Fase 2 encerrada' }
  return (
    <section>
      <h2 className="title">Fase 2 — Quem vai ganhar</h2>
      <div className="row actions">
        <span className="pill">{label[stage] ?? stage}</span>
        <button className="gold" onClick={() => setShow(true)} disabled={!cats.length}>Resultados</button>
        {stage === 'winners_test' ? (<>
          <a className="ghost btnlink" href="/teste" target="_blank" rel="noreferrer">Abrir tela de teste</a>
          <button className="gold" onClick={finishTest}>Finalizar teste (apaga tudo)</button>
        </>) : (<>
          <button className="ghost" onClick={() => setStageTo('winners_test')} disabled={stage === 'categories_open' || stage === 'winners_open'}>Abrir pra teste</button>
          <button className="gold" onClick={() => setStageTo('winners_open')} disabled={stage === 'categories_open' || stage === 'winners_open'}>{stage === 'winners_closed' ? 'Reabrir fase 2' : 'Abrir votação da fase 2'}</button>
          <button className="danger" onClick={() => setStageTo('winners_closed')} disabled={stage !== 'winners_open'}>Encerrar fase 2</button>
        </>)}
      </div>
      {stage === 'categories_open' && <p className="hint">Encerre a votação da fase 1 para liberar a fase 2.</p>}
      {stage === 'winners_test' && <p className="hint">Teste aberto: vote em /teste (como membro ou popular), confira os gráficos abaixo e depois clique em “Finalizar teste”.</p>}
      {err && <p className="err" role="alert">{err}</p>}

      <h3 className="sec">Membros do grupo ({regular.length})</h3>
      <div className="tabs">
        <button className={tab === 'm' ? 'on' : ''} onClick={() => setTab('m')}>Membros</button>
        <button className={tab === 'a' ? 'on' : ''} onClick={() => setTab('a')}>Apelidos</button>
        <button className={tab === 'h' ? 'on' : ''} onClick={() => setTab('h')}>Honorário</button>
      </div>
      {tab === 'm' ? (<>
        <p className="hint">Cada membro tem login (senha padrão 12345). Use o botão “Foto” para colocar a foto de cada um.</p>
        <form onSubmit={add} className="card addm">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Novo membro: nome" />
          <input key={fk} type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <input value={pw} onChange={e => setPw(e.target.value)} placeholder="Senha" />
          <button className="gold" disabled={busy}>{busy ? 'Salvando…' : 'Adicionar membro'}</button>
        </form>
        <div className="mlist">
          {regular.map(m => (
            <div key={m.id} className="card mrow"><Avatar m={m} size={56} />
              <div className="grow"><b>{m.name}</b>{m.nickname && <small className="sub"> “{m.nickname}”</small>}{!m.photo_path && <small className="hint"> · sem foto</small>}</div>
              <label className="link sublink filebtn">Foto<input type="file" accept="image/*" hidden disabled={busy} onChange={e => { changePhoto(m, e.target.files?.[0]); e.target.value = '' }} /></label>
              <button className="link sublink" onClick={() => changePw(m)}>Senha</button>
              <button className="link" onClick={() => remove(m)}>Remover</button></div>))}
        </div>
      </>) : tab === 'a' ? (<>
        <p className="hint">O apelido aparece embaixo do nome na votação. Deixe vazio para não mostrar.</p>
        <div className="mlist">
          {regular.map(m => (
            <div key={m.id} className="card mrow"><Avatar m={m} size={44} /><b className="nm">{m.name}</b>
              <input className="grow" value={nicks[m.id] ?? m.nickname ?? ''} maxLength={30} placeholder="Apelido"
                onChange={e => setNicks({ ...nicks, [m.id]: e.target.value })} /></div>))}
        </div>
        <button className="gold" onClick={saveNicks} disabled={busy || !Object.keys(nicks).length}>{busy ? 'Salvando…' : 'Salvar apelidos'}</button>
      </>) : (<>
        <p className="hint">Indicação em que os votos vão para estas pessoas (e não para os 12 membros):</p>
        <select value={cats.find(c => c.honorary)?.id ?? ''} onChange={e => setHonorCat(e.target.value)} disabled={stage === 'winners_open' || stage === 'winners_test'}>
          <option value="">Nenhuma</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <p className="hint">Indicados ({honor.length}). Preencha o nome (a foto é opcional), clique em Salvar e use “+” para abrir mais um espaço.</p>
        <div className="mlist">
          {honor.map(m => { const d = hd[m.id] ?? {}; const dirty = d.name !== undefined || d.nick !== undefined || !!d.file; return (
            <div key={m.id} className="card hslot"><Avatar m={m} size={48} />
              <input value={d.name ?? m.name} maxLength={40} onChange={e => patchHd(m.id, { name: e.target.value })} placeholder="Nome" />
              <input value={d.nick ?? m.nickname ?? ''} maxLength={30} onChange={e => patchHd(m.id, { nick: e.target.value })} placeholder="Apelido (opcional)" />
              <label className="link sublink filebtn">{d.file ? 'Foto ✓' : 'Foto'}<input type="file" accept="image/*" hidden onChange={e => { patchHd(m.id, { file: e.target.files?.[0] }); e.target.value = '' }} /></label>
              <button className="gold sm" disabled={busy || !dirty} onClick={() => saveHonor(m.id, m)}>Salvar</button>
              <button className="link" onClick={() => remove(m)}>Remover</button></div>) })}
          {empties.map((k, i) => { const d = hd[k] ?? {}; return (
            <div key={k} className="card hslot empty"><span className="av ph" style={{ width: 48, height: 48 }}>{honor.length + i + 1}</span>
              <input value={d.name ?? ''} maxLength={40} onChange={e => patchHd(k, { name: e.target.value })} placeholder="Nome do indicado" />
              <input value={d.nick ?? ''} maxLength={30} onChange={e => patchHd(k, { nick: e.target.value })} placeholder="Apelido (opcional)" />
              <label className="link sublink filebtn">{d.file ? 'Foto ✓' : 'Foto'}<input type="file" accept="image/*" hidden onChange={e => { patchHd(k, { file: e.target.files?.[0] }); e.target.value = '' }} /></label>
              <button className="gold sm" disabled={busy || !d.name?.trim()} onClick={() => saveHonor(k)}>Salvar</button></div>) })}
        </div>
        <button className="ghost" onClick={() => { setEmpties(l => [...l, 'n' + nid]); setNid(n => n + 1) }}>+ Adicionar mais um espaço</button>
      </>)}

      <h3 className="sec">Resultados</h3>
      <p className="hint">Membros que votaram: {sum.member_voters} · Votantes populares: {sum.popular_voters}</p>
      <div className="legend"><span><i className="k g" />Grupo</span><span><i className="k p" />Popular</span></div>

      <div className="card resc"><b>Placar geral (todos os votos recebidos)</b><Bars rows={overall} /></div>
      <div className="card resc"><b>Quem está na frente</b>
        {leaders.map(l => <div key={l.key} className="rrow"><span className="grow">{l.title}</span><span>{l.names}</span><b>{l.votes ? l.votes : '—'}</b></div>)}
      </div>
      <div className="card resc"><b>Votos por indicação</b><Bars rows={perCat} /></div>

      {cats.map(c => {
        const rows: Row[] = members.map(m => {
          const r = res.find(x => x.category_id === c.id && x.nominee_id === m.id)
          return { key: m.id, label: m.name, m, a: r?.member_votes ?? 0, b: r?.popular_votes ?? 0 }
        }).filter(r => r.a + r.b > 0).sort((x, y) => (y.a + y.b) - (x.a + x.b))
        return (
          <div key={c.id} className="card resc"><b>{c.title}</b>
            {rows.length === 0 ? <p className="hint">Sem votos ainda.</p> : <Bars rows={rows} />}
          </div>)
      })}
      {show && <Reveal cats={cats} members={members} res={res} onClose={() => setShow(false)} />}
    </section>)
}
