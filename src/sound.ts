// Efeitos sonoros sintetizados (Web Audio API) — sem arquivos de áudio.
let ctx: AudioContext | null = null
let master: GainNode, bus: GainNode, rollBus: GainNode | null = null, noise: AudioBuffer
let muted = false

export const isMuted = () => muted
export function setMuted(m: boolean) { muted = m; if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02) }

export function initAudio() {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!C) return
    ctx = new C()
    const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination)
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(comp)
    bus = ctx.createGain(); bus.connect(master)
    const len = ctx.sampleRate * 2; noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume()
}

const now = () => ctx!.currentTime
function noiseSrc(t: number, dur: number) {
  const s = ctx!.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, Math.random()); s.stop(t + dur); return s
}
function env(g: GainNode, t: number, peak: number, a: number, d: number) {
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d)
}
function filt(type: BiquadFilterType, f: number, q = 1) { const b = ctx!.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b }

function snare(t: number, vel: number, out: AudioNode) {
  const n = noiseSrc(t, 0.2), g = ctx!.createGain(); env(g, t, vel * 0.5, 0.002, 0.11); n.connect(filt('highpass', 1800)).connect(g).connect(out)
  const o = ctx!.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08)
  const og = ctx!.createGain(); env(og, t, vel * 0.25, 0.002, 0.09); o.connect(og).connect(out); o.start(t); o.stop(t + 0.13)
}
function timpani(t: number, vel: number, out: AudioNode) {
  const o = ctx!.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(135, t); o.frequency.exponentialRampToValueAtTime(68, t + 0.35)
  const g = ctx!.createGain(); env(g, t, vel * 0.9, 0.005, 1.1); o.connect(g).connect(out); o.start(t); o.stop(t + 1.3)
  const n = noiseSrc(t, 0.1), ng = ctx!.createGain(); env(ng, t, vel * 0.5, 0.002, 0.06); n.connect(filt('lowpass', 500)).connect(ng).connect(out)
}
function cymbal(t: number, vel: number, out: AudioNode) {
  const n = noiseSrc(t, 2.6), g = ctx!.createGain(); env(g, t, vel * 0.4, 0.003, 2.2); n.connect(filt('highpass', 5500)).connect(g).connect(out)
  const m = noiseSrc(t, 2.6), g2 = ctx!.createGain(); env(g2, t, vel * 0.25, 0.01, 1.6); m.connect(filt('bandpass', 9500, 2)).connect(g2).connect(out)
}
function brass(freqs: number[], t: number, dur: number, vel: number) {
  for (const f of freqs) for (const det of [-7, 7]) {
    const o = ctx!.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det
    const lp = filt('lowpass', 500, 0.7); lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3600, t + 0.12)
    const g = ctx!.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel * 0.05, t + 0.04)
    g.gain.setValueAtTime(vel * 0.05, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3)
    o.connect(lp).connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.35)
  }
}

/** Uma pancada grave (início de cada indicação). */
export function playBoom() { if (ctx) timpani(now() + 0.02, 0.7, bus) }

/** Rufar de caixa + tímpanos em crescendo. */
export function startRoll(dur: number) {
  if (!ctx) return
  stopRoll(); rollBus = ctx.createGain(); rollBus.connect(bus)
  const t0 = now() + 0.05; let t = t0, k = 0
  while (t < t0 + dur) {
    const p = (t - t0) / dur
    snare(t, (0.18 + 0.82 * Math.pow(p, 1.5)) * (k % 2 ? 0.9 : 1) * (0.9 + Math.random() * 0.2), rollBus)
    t += (0.115 - 0.07 * p) * (0.9 + Math.random() * 0.2); k++
  }
  for (let tt = t0 + 0.2; tt < t0 + dur - 0.2; tt += 0.55 - 0.2 * ((tt - t0) / dur)) timpani(tt, 0.25 + 0.55 * ((tt - t0) / dur), rollBus)
}
export function stopRoll() {
  if (!ctx || !rollBus) return
  const b = rollBus; rollBus = null
  b.gain.setTargetAtTime(0, now(), 0.03); setTimeout(() => b.disconnect(), 500)
}
/** Batida final antes de abrir a cortina. */
export function playHit() { if (!ctx) return; const t = now() + 0.02; timpani(t, 1, bus); cymbal(t, 0.9, bus); snare(t, 1, bus) }
/** Som do tecido da cortina se abrindo. */
export function playCurtain() {
  if (!ctx) return
  const t = now() + 0.02
  const n = noiseSrc(t, 2.4), bp = filt('bandpass', 250, 0.8); bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(1500, t + 2)
  const g = ctx.createGain(); env(g, t, 0.3, 0.6, 1.7); n.connect(bp).connect(g).connect(bus)
  const r = noiseSrc(t, 2.4), rg = ctx.createGain(); env(rg, t, 0.35, 0.4, 1.8); r.connect(filt('lowpass', 140)).connect(rg).connect(bus)
}
/** Fanfarra de metais. */
export function playFanfare() {
  if (!ctx) return
  const t = now() + 0.02
  brass([392, 523.25], t, 0.16, 0.9); brass([392, 523.25], t + 0.22, 0.16, 0.9)
  brass([523.25, 659.25, 783.99, 1046.5], t + 0.44, 1.5, 1)
  timpani(t + 0.44, 0.9, bus); cymbal(t + 0.44, 0.8, bus)
}
/** Aplausos (muitas palmas curtas + fundo de plateia). */
export function playApplause(sec: number) {
  if (!ctx) return
  const t0 = now() + 0.2
  const wash = noiseSrc(t0, sec + 0.5), wg = ctx.createGain(); env(wg, t0, 0.07, sec * 0.3, sec * 0.7); wash.connect(filt('bandpass', 2800, 0.4)).connect(wg).connect(bus)
  for (let i = 0; i < sec * 60; i++) {
    const p = Math.random(), t = t0 + p * sec, w = Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.05)), 0.7)
    const n = noiseSrc(t, 0.06), g = ctx.createGain(); env(g, t, (0.05 + Math.random() * 0.09) * w, 0.002, 0.035)
    n.connect(filt('bandpass', 1500 + Math.random() * 2500, 1.2)).connect(g).connect(bus)
  }
}
/** Silencia tudo o que ainda estiver tocando. */
export function stopAll() {
  if (!ctx) return
  stopRoll(); bus.gain.setTargetAtTime(0, now(), 0.05)
  const old = bus; setTimeout(() => old.disconnect(), 600)
  bus = ctx.createGain(); bus.connect(master)
}
