import { useEffect, useState, useCallback, FormEvent } from 'react'
import { adminClient as sb } from './supabase'
import { errMsg } from './lib'
import { Brand } from './App'
import { downloadTop15 } from './topImage'

type Rank = { id: string; name: string; votes: number; is_official: boolean; suggested_by: string | null; replaced_by: string | null; replaced_by_text: string | null }
type Part = { id: string; name: string; finalized_at: string | null; created_at: string }

const csvCell = (v: string | number | boolean) => {
  let s = String(v); if (/^[=+\-@]/.test(s)) s = "'" + s
  return `"${s.replace(/"/g, '""')}"`
}

export default function Admin() {
  const [state, setState] = useState<'load' | 'login' | 'ok' | 'denied'>('load')
  const [err, setErr] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [rank, setRank] = useState<Rank[]>([]); const [parts, setParts] = useState<Part[]>([]); const [stage, setStage] = useState('')
  const [sub, setSub] = useState<Rank | null>(null); const [subVal, setSubVal] = useState(''); const [subTxt, setSubTxt] = useState('')

  const check = useCallback(async () => {
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return setState('login')
    const { data, error } = await sb.rpc('is_admin')
    if (error) { setErr(errMsg(error)); return setState('login') }
    setState(data ? 'ok' : 'denied')
  }, [])
  useEffect(() => { check() }, [check])

  const load = useCallback(async () => {
    const [r, p, s] = await Promise.all([
      sb.from('category_ranking').select('*').order('votes', { ascending: false }).order('tiebreak', { ascending: false }).order('created_at'),
      sb.from('participants').select('id,name,finalized_at,created_at').order('created_at'),
      sb.from('app_settings').select('stage').eq('id', 1).single()])
    const e = r.error || p.error || s.error
    if (e) return setErr(errMsg(e))
    setRank(r.data as Rank[]); setParts(p.data as Part[]); setStage(s.data!.stage)
  }, [])
  useEffect(() => {
    if (state !== 'ok') return
    load(); const t = setInterval(load, 10000); return () => clearInterval(t)
  }, [state, load])

  async function login(e: FormEvent) {
    e.preventDefault(); setErr('')
    const { error } = await sb.auth.signInWithPassword({ email, password: pw })
    if (error) return setErr('E-mail ou senha inválidos.')
    check()
  }
  const logout = async () => { await sb.auth.signOut(); setState('login') }

  async function close() {
    if (!confirm('Encerrar a votação? Ninguém mais poderá votar nem se cadastrar, e os participantes verão a mensagem "Votação encerrada". As 15 mais votadas viram as categorias oficiais.')) return
    const { error } = await sb.rpc('close_stage1'); if (error) setErr(errMsg(error)); else load()
  }
  async function resetAll() {
    const t = prompt('ATENÇÃO: isso apaga TODOS os participantes, votos e categorias sugeridas, e reabre a etapa 1.\n\nPara confirmar, digite RESETAR:')
    if (t?.trim().toUpperCase() !== 'RESETAR') return
    setErr('')
    const { error } = await sb.rpc('reset_all')
    if (error) return setErr(errMsg(error))
    load()
  }
  const subLabel = (r: Rank): string | undefined =>
    r.replaced_by_text?.trim() || (r.replaced_by ? rank.find(x => x.id === r.replaced_by)?.name : undefined)
  function openSub(r: Rank) { setSub(r); setSubVal(r.replaced_by ?? ''); setSubTxt(r.replaced_by_text ?? '') }
  async function saveSub() {
    if (!sub) return
    setErr('')
    const t = subTxt.trim().replace(/\s+/g, ' ')
    if (t.length > 60) return setErr('O texto da substituição pode ter até 60 caracteres.')
    const patch = t ? { replaced_by_text: t, replaced_by: null } : { replaced_by: subVal || null, replaced_by_text: null }
    const { error } = await sb.from('categories').update(patch).eq('id', sub.id)
    if (error) return setErr(errMsg(error))
    setSub(null); load()
  }
  async function remove(p: Part) {
    if (!confirm(`Remover ${p.name} e as escolhas dele(a)?`)) return
    const { error } = await sb.from('participants').delete().eq('id', p.id); if (error) setErr(errMsg(error)); else load()
  }
  async function baixarImagem() {
    setErr('')
    try { await downloadTop15(rank.slice(0, 15).map(r => ({ name: r.name, votes: r.votes, replacedBy: subLabel(r) }))) }
    catch (e) { setErr(errMsg(e)) }
  }
  function exportCsv() {
    const by = new Map(parts.map(p => [p.id, p.name]))
    const rows = [['posicao', 'categoria', 'votos', 'sugerida_por', 'top15'],
      ...rank.map((r, i) => [i + 1, r.name, r.votes, r.suggested_by ? by.get(r.suggested_by) ?? '' : '', i < 15 ? 'sim' : 'nao'])]
    const csv = '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'solte-meu-awards-resultados.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  if (state === 'load') return <main className="stage hero"><Brand /><p className="lead pulse">Verificando acesso…</p></main>
  if (state !== 'ok') return (
    <main className="stage hero"><Brand />
      <form onSubmit={login} className="card register">
        <label htmlFor="e">Área do administrador</label>
        <input id="e" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" autoComplete="username" required />
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Senha" autoComplete="current-password" required />
        {state === 'denied' && <p className="err">Esta conta não é administradora.</p>}
        {err && <p className="err" role="alert">{err}</p>}
        <button className="gold">Entrar</button>
      </form>
    </main>)

  const by = new Map(parts.map(p => [p.id, p.name]))
  const done = parts.filter(p => p.finalized_at).length
  const open = stage === 'categories_open'
  return (
    <main className="stage admin">
      <header className="top"><Brand small /><button className="ghost" onClick={logout}>Sair</button></header>
      <div className="stats">
        <div className="card"><b>{parts.length}</b>participantes</div>
        <div className="card"><b>{done}</b>finalizaram</div>
        <div className="card"><b>{rank.length}</b>categorias</div>
        <div className="card"><b>{open ? 'Aberta' : 'Encerrada'}</b>votação</div>
      </div>
      <div className="row actions">
        <button className="ghost" onClick={baixarImagem}>Baixar Top 15 (imagem)</button>
        <button className="ghost" onClick={exportCsv}>Exportar CSV</button>
        <button className="ghost" onClick={load}>Atualizar</button>
        <button className="gold" onClick={close} disabled={!open}>{open ? 'Encerrar votação' : 'Votação encerrada'}</button>
        <button className="danger" onClick={resetAll}>Reset</button>
      </div>
      {err && <p className="err" role="alert">{err}</p>}

      <h2 className="title">Ranking das categorias</h2>
      <div className="scroll"><table>
        <thead><tr><th>#</th><th>Categoria</th><th>Votos</th><th>Sugerida por</th><th></th></tr></thead>
        <tbody>{rank.map((r, i) => (
          <tr key={r.id} className={i < 15 ? 'top15' : ''}>
            <td>{i + 1}</td><td>{r.name}{r.is_official && ' 🏆'}{subLabel(r) && <small className="sub"> → substituída por {subLabel(r)}</small>}</td><td>{r.votes}</td><td>{r.suggested_by ? by.get(r.suggested_by) ?? '—' : '—'}</td>
            <td><button className="link sublink" onClick={() => openSub(r)}>Substituir</button></td>
          </tr>))}</tbody>
      </table></div>
      <p className="hint">Linhas douradas = as 15 mais votadas (desempate por antiguidade).</p>

      <h2 className="title">Participantes</h2>
      <div className="scroll"><table>
        <thead><tr><th>Nome</th><th>Status</th><th>Cadastro</th><th></th></tr></thead>
        <tbody>{parts.map(p => (
          <tr key={p.id}><td>{p.name}</td><td>{p.finalized_at ? 'Finalizou' : 'Em andamento'}</td>
            <td>{new Date(p.created_at).toLocaleString('pt-BR')}</td>
            <td><button className="link" onClick={() => remove(p)}>Remover</button></td></tr>))}</tbody>
      </table></div>
      {sub && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="card">
            <h3>Substituir “{sub.name}”</h3>
            <p className="hint">Na imagem do Top 15, a substituição aparece em destaque e, embaixo, “substituição da {sub.name}”.</p>
            <label htmlFor="st" className="lbl">Escreva uma nova categoria</label>
            <input id="st" value={subTxt} onChange={e => setSubTxt(e.target.value)} maxLength={60} placeholder="Ex.: Mais Estressado" />
            <p className="hint">Ou escolha uma categoria que já existe (o texto acima tem prioridade):</p>
            <select value={subVal} onChange={e => setSubVal(e.target.value)} disabled={!!subTxt.trim()}>
              <option value="">Sem substituição</option>
              {rank.filter(r => r.id !== sub.id).map(r => <option key={r.id} value={r.id}>{r.name} ({r.votes} votos)</option>)}
            </select>
            <div className="row" style={{ marginTop: '1rem' }}><button className="ghost" onClick={() => setSub(null)}>Cancelar</button><button className="gold" onClick={saveSub}>Salvar</button></div>
          </div>
        </div>
      )}
    </main>)
}
