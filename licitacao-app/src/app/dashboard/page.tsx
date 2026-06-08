'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'

type Licitacao = {
  id: string
  nome: string
  orgao: string
  status: string
  created_at: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [usuario, setUsuario] = useState<string>('')

  useEffect(() => {
    async function init() {
      setUsuario('usuario@teste.com')

      const { data } = await supabase
        .from('licitacoes')
        .select('*')
        .order('created_at', { ascending: false })

      setLicitacoes(data || [])
      setCarregando(false)
    }
    init()
  }, [router])

  function formatarData(data: string) {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
  }

  function corStatus(status: string) {
    const cores: Record<string, { bg: string; color: string; label: string }> = {
      pendente: { bg: '#fef3c7', color: '#d97706', label: 'Pendente' },
      processando: { bg: '#dbeafe', color: '#1d4ed8', label: 'Processando' },
      concluido: { bg: '#dcfce7', color: '#16a34a', label: 'Concluído' },
      erro: { bg: '#fee2e2', color: '#dc2626', label: 'Erro' },
    }
    return cores[status] || cores.pendente
  }

  async function excluir(id: string) {
    if (!confirm('Deseja excluir esta licitação?')) return
    await supabase.from('licitacoes').delete().eq('id', id)
    setLicitacoes(prev => prev.filter(l => l.id !== id))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Header />

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Boas vindas */}
        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>
              Olá, bem-vindo! 👋
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b' }}>
              {usuario} — gerencie suas licitações abaixo
            </p>
          </div>
          <a
            href="/licitacoes/nova"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'linear-gradient(135deg, #1e40af, #2563eb)',
              color: 'white',
              borderRadius: '9px',
              fontSize: '14px',
              fontWeight: '600',
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(30, 64, 175, 0.25)',
              transition: 'transform 0.15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nova Licitação
          </a>
        </div>

        {/* Cards de resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {[
            { label: 'Total', valor: licitacoes.length, cor: '#1e40af', bg: '#eff6ff' },
            { label: 'Concluídas', valor: licitacoes.filter(l => l.status === 'concluido').length, cor: '#16a34a', bg: '#f0fdf4' },
            { label: 'Pendentes', valor: licitacoes.filter(l => l.status === 'pendente').length, cor: '#d97706', bg: '#fffbeb' },
          ].map(card => (
            <div key={card.label} style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px 24px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '500' }}>{card.label}</p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: card.cor }}>{card.valor}</p>
            </div>
          ))}
        </div>

        {/* Tabela de licitações */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
              Licitações Cadastradas
            </h2>
          </div>

          {carregando ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
              Carregando...
            </div>
          ) : licitacoes.length === 0 ? (
            <div style={{ padding: '64px 24px', textAlign: 'center' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto 16px' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p style={{ color: '#94a3b8', fontSize: '15px', marginBottom: '16px' }}>
                Nenhuma licitação cadastrada ainda.
              </p>
              <a href="/licitacoes/nova" style={{
                display: 'inline-block',
                padding: '9px 20px',
                background: '#1e40af',
                color: 'white',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                textDecoration: 'none',
              }}>
                Cadastrar primeira licitação
              </a>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Nome', 'Órgão', 'Status', 'Data', 'Ações'].map(col => (
                      <th key={col} style={{
                        padding: '12px 20px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {licitacoes.map((l, i) => {
                    const status = corStatus(l.status)
                    return (
                      <tr key={l.id} style={{
                        borderBottom: i < licitacoes.length - 1 ? '1px solid #f1f5f9' : 'none',
                        transition: 'background 0.1s',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: '500', color: '#0f172a' }}>
                          {l.nome}
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: '14px', color: '#475569' }}>
                          {l.orgao}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: status.bg,
                            color: status.color,
                          }}>
                            {status.label}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: '13px', color: '#64748b' }}>
                          {formatarData(l.created_at)}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <a href={`/licitacoes/${l.id}`} style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: '#1e40af',
                              background: '#eff6ff',
                              textDecoration: 'none',
                              border: '1px solid #bfdbfe',
                            }}>
                              Abrir
                            </a>
                            <button onClick={() => excluir(l.id)} style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: '#dc2626',
                              background: '#fef2f2',
                              border: '1px solid #fecaca',
                              cursor: 'pointer',
                            }}>
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
