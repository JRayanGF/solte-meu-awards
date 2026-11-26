import { useEffect, useMemo, useRef, useState } from 'react'
import { Framed, Member } from './photo'
import { initAudio, isMuted, setMuted, playBoom, startRoll, stopRoll, playHit, playCurtain, playFanfare, playApplause, stopAll } from './sound'

type Cat = { id: string; title: string; pos: number | null }
type Res = { category_id: string; nominee_id: string; member_votes: number; popular_votes: number }
type W = { m: Member; a: number; b: number; total: number }
type P = { x: number; y: number; vx: number; vy: number; w: number; h: number; r: number; vr: number; col: string }
type Ph = 'intro' | 'suspense' | 'pause' | 'opening' | 'revealed'

/** Confete saindo dos dois lados da tela a cada disparo (shot). */
function Confetti({ shot }: { shot: number }) {
  const ref = useRef<HTMLCanvasElement>(null); const ps = useRef<P[]>([]); const raf = useRef(0); const tm = useRef<number[]>([])
  useEffect(() => {
    if (!shot) return
    const c = ref.current; if (!c) return
    const W = (c.width = window.innerWidth), H = (c.height = window.innerHeight)
    const ctx = c.getContext('2d'); if (!ctx) return
    const cols = ['#f6e3a1', '#d9b24c', '#ff6b6b', '#4fb0a8', '#ffffff', '#b388ff']
    const spawn = (side: 1 | -1) => {
      for (let i = 0; i < 70; i++) {
        const a = ((35 + Math.random() * 45) * Math.PI) / 180, sp = 14 + Math.random() * 14
        ps.current.push({ x: side === 1 ? 0 : W, y: H * 0.9, vx: Math.cos(a) * sp * side, vy: -Math.sin(a) * sp,
          w: 6 + Math.random() * 7, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, col: cols[i % cols.length] })
      }
    }
    const tick = () => {
      ctx.clearRect(0, 0, W, H)
      ps.current = ps.current.filter(p => p.y < H + 30)
      for (const p of ps.current) {
        p.vy += 0.45; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore()
      }
      if (ps.current.length) raf.current = requestAnimationFrame(tick)
    }
    spawn(1); spawn(-1)
    tm.current.push(window.setTimeout(() => { spawn(1); spawn(-1) }, 350), window.setTimeout(() => { spawn(1); spawn(-1) }, 750))
    cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(tick)
  }, [shot])
  useEffect(() => () => { cancelAnimationFrame(raf.current); tm.current.forEach(clearTimeout) }, [])
  return <canvas ref={ref} className="confetti" />
}

export default function Reveal({ cats, members, res, onClose }: { cats: Cat[]; members: Member[]; res: Res[]; onClose: () => void }) {
  const [asc, setAsc] = useState(false); const [started, setStarted] = useState(false)
  const [i, setI] = useState(0); const [ph, setPh] = useState<Ph>('intro'); const [fin, setFin] = useState(false); const [shot, setShot] = useState(0); const [mute, setMute] = useState(isMuted())
  const timers = useRef<number[]>([])
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const after = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)) }

  const items = useMemo(() => {
    const byId = new Map(members.map(m => [m.id, m]))
    const list = cats.map((c, idx) => {
      const rows: W[] = res.filter(r => r.category_id === c.id).flatMap(r => {
        const m = byId.get(r.nominee_id); const total = r.member_votes + r.popular_votes
        return m && total > 0 ? [{ m, a: r.member_votes, b: r.popular_votes, total }] : []
      })
      const top = Math.max(0, ...rows.map(x => x.total))
      return { c, pos: c.pos ?? idx + 1, winners: rows.filter(x => x.total === top) }
    })
    return list.sort((x, y) => (asc ? x.pos - y.pos : y.pos - x.pos))
  }, [cats, members, res, asc])

  const doOpen = () => {
    clear(); setPh('opening'); playCurtain()
    after(350, () => { playFanfare(); playApplause(3.8); setShot(n => n + 1) })
    after(2100, () => setPh('revealed'))
  }
  const go = () => { clear(); stopRoll(); playHit(); setPh('pause'); after(500, doOpen) }
  const next = () => {
    if (i < items.length - 1) setI(i + 1)
    else { clear(); stopRoll(); setFin(true); setShot(n => n + 1); playFanfare(); playApplause(5) }
  }
  useEffect(() => {
    if (!started || fin) return
    clear(); stopRoll(); setPh('intro'); playBoom()
    after(2600, () => { setPh('suspense'); startRoll(4.8) })
    after(7400, go)
    return () => { clear(); stopRoll() }
  }, [started, i, fin])
  useEffect(() => () => { clear(); stopAll() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (!started || fin || !['Enter', 'ArrowRight', ' '].includes(e.key)) return
      e.preventDefault()
      if (ph === 'revealed') next(); else if (ph === 'intro' || ph === 'suspense') go()
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  if (!started) return (
    <div className="rv"><button className="ghost rvx" onClick={onClose}>✕ Fechar</button>
      <div className="rvc">
        <small className="plc">Solte Meu Awards</small><h2 className="rvt">Apuração</h2>
        <p className="lead">{items.length} indicações. Ordem da apuração:</p>
        <div className="tabs">
          <button className={!asc ? 'on' : ''} onClick={() => setAsc(false)}>Do 15º ao 1º</button>
          <button className={asc ? 'on' : ''} onClick={() => setAsc(true)}>Do 1º ao 15º</button>
        </div>
        <button className="gold big" onClick={() => { initAudio(); setStarted(true) }} disabled={!items.length}>Começar apuração</button>
      </div>
    </div>)

  if (fin) return (
    <div className="rv"><button className="ghost rvx" onClick={onClose}>✕ Fechar</button><Confetti shot={shot} />
      <div className="rvc">
        <small className="plc">Solte Meu Awards</small><h2 className="rvt">Todos os vencedores</h2>
        <div className="fgrid">
          {items.map(it => (
            <div key={it.c.id} className="fcard">
              <span className="fp">{it.pos}º</span><span className="ft">{it.c.title}</span>
              {it.winners.length === 0 ? <small className="hint">Sem votos</small> : (
                <div className="fw">{it.winners.map(w => (
                  <div key={w.m.id} className="fone"><div className="fpic"><Framed m={w.m} /></div><b>{w.m.name}</b></div>))}</div>)}
            </div>))}
        </div>
        <div className="row"><button className="ghost" onClick={() => { stopAll(); setFin(false); setI(0) }}>Rever apuração</button><button className="gold" onClick={onClose}>Fechar</button></div>
      </div>
    </div>)

  const cur = items[i]; const opened = ph === 'opening' || ph === 'revealed'
  const toggleMute = () => { setMuted(!mute); setMute(!mute) }
  return (
    <div className="rv"><button className="ghost rvx" onClick={onClose}>✕ Sair</button>
      <button className="ghost rvm" onClick={toggleMute} aria-label="Som">{mute ? '🔇 Mudo' : '🔊 Som'}</button><Confetti shot={shot} />
      <div className="rvc">
        <div key={i} className="rvin">
          <small className="plc">Colocação {cur.pos}º</small>
          <h2 className="rvt">{cur.c.title}</h2>
        </div>
        <div className={'theater' + (ph === 'pause' ? ' dim' : '') + (opened ? ' lit' : '')}>
          <div className="floor" /><div className="beam b1" /><div className="beam b2" />
          {opened && (
            <div className="winners">
              {cur.winners.length === 0 ? <p className="rvn">Sem votos nesta indicação</p> : cur.winners.map(w => (
                <div key={w.m.id} className="win">
                  <div style={{ width: cur.winners.length === 1 ? 210 : 140 }}><Framed m={w.m} /></div>
                  <h3>{w.m.name}</h3>{w.m.nickname && <small className="nick">{w.m.nickname}</small>}
                  <small>{w.total} {w.total === 1 ? 'voto' : 'votos'} · Grupo {w.a} · Popular {w.b}</small>
                </div>))}
            </div>)}
          <div className={'glow' + (ph === 'suspense' ? ' on' : '') + (ph === 'pause' ? ' full' : '')} />
          <div className={'curtain l' + (opened ? ' open' : '') + (ph === 'suspense' ? ' shake' : '')} />
          <div className={'curtain r' + (opened ? ' open' : '') + (ph === 'suspense' ? ' shake' : '')} />
          <div className="valance" />
          {ph === 'opening' && <div className="flash" />}
        </div>
        <p className={'cap' + (ph === 'suspense' ? ' pulse' : '')}>
          {ph === 'intro' && 'Prepare-se…'}{ph === 'suspense' && <>E o vencedor é<span className="dots" /></>}{ph === 'revealed' && cur.winners.length > 1 && 'Empate!'}
        </p>
        {(ph === 'intro' || ph === 'suspense') && <button className="ghost" onClick={go}>Revelar agora</button>}
        {ph === 'revealed' && <button className="gold big" onClick={next}>{i < items.length - 1 ? 'Próxima categoria →' : 'Ver todos os vencedores'}</button>}
      </div>
    </div>)
}
