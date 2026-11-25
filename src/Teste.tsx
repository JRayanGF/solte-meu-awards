import { useEffect, useState } from 'react'
import { adminClient as sb } from './supabase'
import { errMsg } from './lib'
import { Brand } from './App'
import Phase2 from './Phase2'

export default function Teste() {
  const [st, setSt] = useState<'load' | 'login' | 'off' | 'ok'>('load'); const [err, setErr] = useState('')
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (!session) return setSt('login')
        const { data: adm, error } = await sb.rpc('is_admin'); if (error) throw error
        if (!adm) return setSt('login')
        const { data, error: e2 } = await sb.from('app_settings').select('stage').eq('id', 1).single(); if (e2) throw e2
        setSt(data.stage === 'winners_test' ? 'ok' : 'off')
      } catch (e) { setErr(errMsg(e)); setSt('login') }
    })()
  }, [])
  if (st === 'ok') return (<><div className="testbar">MODO TESTE — os votos feitos aqui serão apagados ao finalizar o teste</div><Phase2 client={sb} test /></>)
  return (
    <main className="stage hero"><Brand />
      <div className="card">
        {st === 'load' && <p className="lead pulse">Verificando acesso…</p>}
        {st === 'login' && <><p className="lead">Entre primeiro no painel de admin para usar a votação de teste.</p>{err && <p className="err">{err}</p>}<a className="ghost btnlink" href="/admin">Ir para o admin</a></>}
        {st === 'off' && <><p className="lead">O modo de teste não está aberto. Clique em “Abrir pra teste” no painel de admin.</p><a className="ghost btnlink" href="/admin">Ir para o admin</a></>}
      </div>
    </main>)
}
