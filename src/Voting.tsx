import { useEffect, useState, useCallback, FormEvent } from 'react'
import { supabase } from './supabase'
import { MAX, norm, errMsg } from './lib'
import { Brand, Closed } from './App'

export type Participant = { id: string; name: string; finalized_at: string | null }
type Cat = { id: string; name: string; is_official: boolean }

export default function Voting({ p, onFinal }: { p: Participant; onFinal: (f: string) => void }) {
  const [cats, setCats] = useState<Cat[]>([]); const [sel, setSel] = useState<Set<string>>(new Set())
  const [stage, setStage] = useState('categories_open'); const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false); const [txt, setTxt] = useState(''); const [ask, setAsk] = useState(false)
  const [ready, setReady] = useState(false)
  const locked = !!p.finalized_at || stage !== 'categories_open'

  const loadCats = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('id,name,is_official').order('created_at')
    if (error) setErr(errMsg(error)); else setCats(data as Cat[])
  }, [])
  const loadStage = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('stage').eq('id', 1).single()
    if (data) setStage(data.stage)
  }, [])

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('category_selections').select('category_id').eq('participant_id', p.id)
      if (error) setErr(errMsg(error)); else setSel(new Set(data.map(r => r.category_id as string)))
      await Promise.all([loadCats(), loadStage()]); setReady(true)
    })()
    const ch = supabase.channel('live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, loadCats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, loadStage)
      .subscribe()
    const refresh = () => { loadCats(); loadStage() }
    window.addEventListener('focus', refresh)
    return () => { supabase.removeChannel(ch); window.removeEventListener('focus', refresh) }
  }, [p.id, loadCats, loadStage])

  async function toggle(id: string) {
    if (locked || busy) return
    setErr('')
    const on = sel.has(id)
    if (!on && sel.size >= MAX) return setErr('Você já escolheu 15 categorias. Desmarque uma para trocar.')
    setBusy(true)
    const { error } = on
      ? await supabase.from('category_selections').delete().match({ participant_id: p.id, category_id: id })
      : await supabase.from('category_selections').insert({ participant_id: p.id, category_id: id })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setSel(s => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n })
  }

  async function suggest(e: FormEvent) {
    e.preventDefault(); setErr('')
    const n = norm(txt)
    if (n.length < 3) return setErr('Digite ao menos 3 caracteres.')
    if (sel.size >= MAX) return setErr('Limite de 15 atingido. Desmarque uma categoria antes de sugerir.')
    if (cats.some(c => c.name.toLowerCase() === n.toLowerCase())) return setErr('Essa categoria já existe na lista.')
    setBusy(true)
    const { data, error } = await supabase.rpc('suggest_category', { p_name: n })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setSel(s => new Set(s).add(data as string)); setTxt(''); loadCats()
  }

  async function finalize() {
    setErr(''); setBusy(true)
    const { data, error } = await supabase.from('participants')
      .update({ finalized_at: new Date().toISOString() }).eq('id', p.id).select('finalized_at').single()
    setBusy(false); setAsk(false)
    if (error) return setErr(errMsg(error))
    onFinal(data.finalized_at as string)
  }

  if (!ready) return <main className="stage hero"><Brand /><p className="lead pulse">Carregando categorias…</p>{err && <p className="err">{err}</p>}</main>

  if (stage !== 'categories_open') return <Closed />

  if (locked) {
    const list = cats.filter(c => sel.has(c.id))
    return (
      <main className="stage hero">
        <Brand />
        <div className="card done">
          <h2>{`Valeu, ${p.name}!`}</h2>
          <p className="lead">Suas escolhas foram registradas. Agora é aguardar o encerramento da votação.</p>
          <ol className="picked">{list.map(c => <li key={c.id}>{c.name}</li>)}</ol>
        </div>
      </main>
    )
  }

  return (
    <main className="stage">
      <header className="top"><Brand small /><span className="who">{p.name}</span></header>
      <h2 className="title">Escolha as 15 categorias oficiais</h2>
      <p className="lead">Aqui ninguém vota em vencedor ainda. Marque as categorias que merecem existir.</p>

      <ul className="cats">
        {cats.map(c => (
          <li key={c.id}>
            <label className={'cat' + (sel.has(c.id) ? ' on' : '')}>
              <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} disabled={busy} />
              <span className="box" aria-hidden="true">✓</span>
              <span>{c.name}</span>
            </label>
          </li>
        ))}
      </ul>

      <form onSubmit={suggest} className="card suggest">
        <label htmlFor="s">Faltou alguma? Sugira uma categoria</label>
        <div className="row">
          <input id="s" value={txt} onChange={e => setTxt(e.target.value)} maxLength={40} placeholder="Ex.: Mais Atrasado" />
          <button className="ghost" disabled={busy}>Sugerir</button>
        </div>
      </form>

      {err && <p className="err" role="alert">{err}</p>}

      <div className="bar">
        <div className="count"><b>{sel.size}</b>/{MAX} categorias</div>
        <button className="gold" disabled={busy || sel.size === 0} onClick={() => setAsk(true)}>Finalizar votação</button>
      </div>

      {ask && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="card">
            <h3>Finalizar com {sel.size} categorias?</h3>
            <p>Depois de finalizar, não dá para alterar.</p>
            <div className="row"><button className="ghost" onClick={() => setAsk(false)}>Voltar</button><button className="gold" onClick={finalize} disabled={busy}>Confirmar</button></div>
          </div>
        </div>
      )}
    </main>
  )
}
