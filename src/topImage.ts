export type TopItem = { name: string; votes: number }
const W = 1080, H = 1350
const GOLD = '#d9b24c', GOLD2 = '#f6e3a1'

export function drawTop15(ctx: CanvasRenderingContext2D, items: TopItem[]) {
  const serif = "Cinzel, Georgia, serif", sans = "Figtree, system-ui, sans-serif"
  const spaced = (px: number) => { if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = px + 'px' }

  // fundo
  ctx.fillStyle = '#0b0a10'; ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 800)
  glow.addColorStop(0, 'rgba(217,178,76,0.28)'); glow.addColorStop(1, 'rgba(217,178,76,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.strokeRect(28, 28, W - 56, H - 56)
  ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.strokeRect(42, 42, W - 84, H - 84); ctx.globalAlpha = 1

  // cabeçalho
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = GOLD2; ctx.font = `600 26px ${serif}`; spaced(10)
  ctx.fillText('SOLTE MEU', W / 2 + 5, 104)
  const g = ctx.createLinearGradient(300, 0, 780, 0)
  g.addColorStop(0, '#b8892b'); g.addColorStop(0.5, GOLD2); g.addColorStop(1, '#b8892b')
  ctx.fillStyle = g; ctx.font = `800 84px ${serif}`; spaced(6)
  ctx.fillText('AWARDS', W / 2 + 3, 188)
  spaced(0)
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(300, 226); ctx.lineTo(480, 226); ctx.moveTo(600, 226); ctx.lineTo(780, 226); ctx.stroke()
  ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(540, 212); ctx.lineTo(552, 226); ctx.lineTo(540, 240); ctx.lineTo(528, 226); ctx.fill()
  ctx.fillStyle = '#f2ecdc'; ctx.font = `600 30px ${serif}`; spaced(5)
  ctx.fillText('TOP 15 CATEGORIAS OFICIAIS', W / 2 + 2, 292); spaced(0)

  // lista
  const top = 322, rowH = 62
  items.slice(0, 15).forEach((it, i) => {
    const y = top + i * rowH, cy = y + rowH / 2
    if (i % 2 === 0) { ctx.fillStyle = 'rgba(217,178,76,0.07)'; ctx.fillRect(80, y + 3, W - 160, rowH - 6) }
    ctx.fillStyle = i < 3 ? GOLD : '#2a2433'
    ctx.beginPath(); ctx.arc(128, cy, 22, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.textAlign = 'center'; ctx.fillStyle = i < 3 ? '#201807' : GOLD2
    ctx.font = `800 24px ${serif}`; ctx.fillText(String(i + 1), 128, cy + 8)

    let size = 34; ctx.textAlign = 'left'; ctx.font = `700 ${size}px ${sans}`
    while (ctx.measureText(it.name).width > 620 && size > 16) { size--; ctx.font = `700 ${size}px ${sans}` }
    ctx.fillStyle = i < 3 ? GOLD2 : '#f2ecdc'; ctx.fillText(it.name, 176, cy + size * 0.33)

    ctx.textAlign = 'right'; ctx.fillStyle = '#9a93a8'; ctx.font = `500 24px ${sans}`
    ctx.fillText(`${it.votes} ${it.votes === 1 ? 'voto' : 'votos'}`, W - 104, cy + 8)
  })

  // rodapé
  ctx.textAlign = 'center'; ctx.fillStyle = '#9a93a8'; ctx.font = `500 22px ${sans}`
  ctx.fillText(new Date().toLocaleDateString('pt-BR'), W / 2, H - 62)
}

export async function downloadTop15(items: TopItem[]) {
  if (!items.length) throw new Error('Ainda não há categorias para gerar a imagem.')
  try {
    await Promise.all([document.fonts.load('800 60px Cinzel'), document.fonts.load('600 30px Cinzel'),
      document.fonts.load('700 30px Figtree'), document.fonts.load('500 24px Figtree')])
  } catch { /* usa fontes de reserva */ }
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d'); if (!ctx) throw new Error('Seu navegador não suporta gerar imagens.')
  drawTop15(ctx, items)
  const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/png'))
  if (!blob) throw new Error('Não foi possível gerar a imagem.')
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = 'solte-meu-awards-top15.png'; a.click(); URL.revokeObjectURL(a.href)
}
