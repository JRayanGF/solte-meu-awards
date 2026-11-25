import { supabase } from './supabase'

export type Member = { id: string; name: string; photo_path: string | null }

export const photoUrl = (path: string | null) =>
  path ? supabase.storage.from('member-photos').getPublicUrl(path).data.publicUrl : null

export function Avatar({ m, size = 96 }: { m: Member; size?: number }) {
  const u = photoUrl(m.photo_path)
  return u
    ? <img className="av" src={u} alt={m.name} loading="lazy" style={{ width: size, height: size }} />
    : <span className="av ph" style={{ width: size, height: size, fontSize: size / 2.4 }}>{m.name.slice(0, 1).toUpperCase()}</span>
}

/** Recorta no centro (quadrado) e comprime para JPEG antes de enviar. */
export async function squareJpeg(file: File, size = 480): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Não foi possível ler essa imagem.')); i.src = url
    })
    const c = document.createElement('canvas'); c.width = c.height = size
    const s = Math.min(img.width, img.height)
    c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Falha ao processar a foto.'))), 'image/jpeg', 0.85))
  } finally { URL.revokeObjectURL(url) }
}
