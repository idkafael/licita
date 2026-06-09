'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'

type TipoPlanilha = {
  key: 'licitacao' | 'orcamento_resumido' | 'cpu' | 'cronograma'
  label: string
  descricao: string
  cor: string
}

const TIPOS: TipoPlanilha[] = [
  {
    key: 'licitacao',
    label: 'Planilha de Licitação',
    descricao: 'Orçamento sintético com itens unitários',
    cor: '#1e40af',
  },
  {
    key: 'orcamento_resumido',
    label: 'Orçamento Resumido',
    descricao: 'Totais por categoria de serviço',
    cor: '#7c3aed',
  },
  {
    key: 'cpu',
    label: 'CPU — Composição de Preço Unitário',
    descricao: 'Insumos e mão de obra detalhados',
    cor: '#0891b2',
  },
  {
    key: 'cronograma',
    label: 'Cronograma Físico-Financeiro',
    descricao: 'Distribuição de valores por mês',
    cor: '#059669',
  },
]

type EstadoPlanilha = {
  arquivo: File | null
  percentual: string
  processando: boolean
  concluido: boolean
  erro: string
  preview: PreviewData | null
}

type PreviewData = {
  itens: { descricao: string; valor_original: number; valor_novo: number; reducao: number }[]
  total_itens: number
  valor_original_total: number
  valor_novo_total: number
  reducao_total: number
  percentual: number
}

const estadoInicial: EstadoPlanilha = {
  arquivo: null,
  percentual: '',
  processando: false,
  concluido: false,
  erro: '',
  preview: null,
}

export default function NovaLicitacaoPage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [orgao, setOrgao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [planilhas, setPlanilhas] = useState<Record<string, EstadoPlanilha>>({
    licitacao: { ...estadoInicial },
    orcamento_resumido: { ...estadoInicial },
    cpu: { ...estadoInicial },
    cronograma: { ...estadoInicial },
  })
  const [previewAtivo, setPreviewAtivo] = useState<string | null>(null)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const apiUrl = ''  // Usa rotas internas Next.js (/api/processar, /api/preview)

  useEffect(() => {
    // Auth desativado temporariamente para testes
  }, [router])

  function atualizarPlanilha(key: string, dados: Partial<EstadoPlanilha>) {
    setPlanilhas(prev => ({
      ...prev,
      [key]: { ...prev[key], ...dados },
    }))
  }

  function onArquivoSelecionado(key: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    atualizarPlanilha(key, { arquivo: file, concluido: false, erro: '', preview: null })
  }

  async function gerarPreview(key: string) {
    const p = planilhas[key]
    if (!p.arquivo || !p.percentual) return

    atualizarPlanilha(key, { processando: true, erro: '' })
    setPreviewAtivo(key)

    const form = new FormData()
    form.append('arquivo', p.arquivo)
    form.append('tipo', key)
    form.append('percentual', p.percentual)

    try {
      const res = await fetch(`${apiUrl}/api/preview`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('Erro ao gerar preview')
      const dados: PreviewData = await res.json()
      atualizarPlanilha(key, { preview: dados, processando: false })
    } catch {
      atualizarPlanilha(key, { erro: 'Erro ao gerar preview. Verifique o arquivo.', processando: false })
    }
  }

  async function processarTodas() {
    if (!nome.trim() || !orgao.trim()) {
      alert('Preencha o nome e o órgão da licitação.')
      return
    }

    const comArquivo = TIPOS.filter(t => planilhas[t.key].arquivo)
    if (comArquivo.length === 0) {
      alert('Anexe pelo menos uma planilha.')
      return
    }

    setSalvando(true)

    // Supabase desativado temporariamente — usando ID fictício para teste
    const licitacao = { id: 'teste-' + Date.now() }

    // Processar cada planilha
    for (const tipo of comArquivo) {
      const p = planilhas[tipo.key]
      if (!p.arquivo || !p.percentual) continue

      atualizarPlanilha(tipo.key, { processando: true, erro: '' })

      const form = new FormData()
      form.append('arquivo', p.arquivo)
      form.append('tipo', tipo.key)
      form.append('percentual', p.percentual)

      try {
        const res = await fetch(`${apiUrl}/api/processar`, { method: 'POST', body: form })
        if (!res.ok) throw new Error('Erro ao processar')

        const blob = await res.blob()
        const nomeArq = `${licitacao.id}/${tipo.key}_${Date.now()}.xlsx`

        // Upload do arquivo gerado para o Supabase Storage
        // Download automático
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const ext = p.arquivo!.name.split('.').pop()?.toLowerCase() || 'xlsx'
        a.download = `${tipo.label}_reduzida_${p.percentual}pct.${ext}`
        a.click()
        URL.revokeObjectURL(url)

        atualizarPlanilha(tipo.key, { processando: false, concluido: true })
      } catch {
        atualizarPlanilha(tipo.key, { processando: false, erro: 'Erro ao processar este arquivo.' })
      }
    }

    setSalvando(false)
  }

  const totalAnexado = TIPOS.filter(t => planilhas[t.key].arquivo).length
  const previewData = previewAtivo ? planilhas[previewAtivo]?.preview : null

  function formatBRL(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Header />

      <main style={{ maxWidth: '1300px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Título */}
        <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a href="/dashboard" style={{ color: '#64748b', textDecoration: 'none', fontSize: '13px', fontWeight: '500' }}>
            ← Dashboard
          </a>
          <span style={{ color: '#cbd5e1' }}>/</span>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>
            Nova Licitação
          </h1>
        </div>

        {/* Dados da licitação */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>
            Dados da Licitação
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Nome / Objeto *
              </label>
              <input
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: Reforma Escola Municipal IV Centenário"
                style={{
                  width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0',
                  borderRadius: '8px', fontSize: '14px', color: '#0f172a', background: '#f8fafc',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Órgão *
              </label>
              <input
                type="text"
                value={orgao}
                onChange={e => setOrgao(e.target.value)}
                placeholder="Ex: Prefeitura Municipal de Goiana"
                style={{
                  width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0',
                  borderRadius: '8px', fontSize: '14px', color: '#0f172a', background: '#f8fafc',
                }}
              />
            </div>
          </div>
        </div>

        {/* Layout principal: cadastro + preview */}
        <div style={{ display: 'grid', gridTemplateColumns: '480px 1fr', gap: '24px', alignItems: 'start' }}>

          {/* Coluna esquerda: CADASTRO DE LICITAÇÃO */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Cadastro de Licitação
              </h2>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                {totalAnexado}/4 planilhas
              </span>
            </div>

            <div style={{ padding: '16px' }}>
              {TIPOS.map((tipo, i) => {
                const p = planilhas[tipo.key]
                const temArquivo = !!p.arquivo
                const podePreview = temArquivo && p.percentual && parseFloat(p.percentual) > 0

                return (
                  <div key={tipo.key} style={{
                    marginBottom: i < TIPOS.length - 1 ? '12px' : 0,
                    border: `1.5px solid ${p.concluido ? '#bbf7d0' : p.erro ? '#fecaca' : temArquivo ? '#bfdbfe' : '#e2e8f0'}`,
                    borderRadius: '10px',
                    padding: '14px',
                    background: p.concluido ? '#f0fdf4' : p.erro ? '#fef2f2' : temArquivo ? '#f0f7ff' : '#fafafa',
                    transition: 'all 0.2s',
                  }}>
                    {/* Cabeçalho do tipo */}
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: p.concluido ? '#16a34a' : p.erro ? '#dc2626' : tipo.cor,
                        }} />
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                          {tipo.label}
                        </span>
                      </div>
                      <p style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '16px' }}>
                        {tipo.descricao}
                      </p>
                    </div>

                    {/* Linha: botão anexar + campo % */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {/* Botão anexar */}
                      <input
                        ref={el => { inputRefs.current[tipo.key] = el }}
                        type="file"
                        accept=".xlsx,.xls,.xlsm,.pdf"
                        onChange={e => onArquivoSelecionado(tipo.key, e)}
                        style={{ display: 'none' }}
                      />
                      <button
                        onClick={() => inputRefs.current[tipo.key]?.click()}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: `1.5px dashed ${temArquivo ? tipo.cor : '#cbd5e1'}`,
                          borderRadius: '8px',
                          background: temArquivo ? 'white' : 'transparent',
                          color: temArquivo ? tipo.cor : '#94a3b8',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          transition: 'all 0.15s',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          {temArquivo
                            ? <><polyline points="20 6 9 17 4 12"/></>
                            : <><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></>
                          }
                        </svg>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {temArquivo ? p.arquivo!.name : 'Anexar planilha'}
                        </span>
                      </button>

                      {/* Campo % */}
                      <div style={{ position: 'relative', width: '90px', flexShrink: 0 }}>
                        <input
                          type="number"
                          min="0.1"
                          max="99.9"
                          step="0.1"
                          value={p.percentual}
                          onChange={e => atualizarPlanilha(tipo.key, { percentual: e.target.value, preview: null, concluido: false })}
                          placeholder="0"
                          style={{
                            width: '100%',
                            padding: '8px 28px 8px 10px',
                            border: '1.5px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: '600',
                            color: '#0f172a',
                            background: 'white',
                          }}
                        />
                        <span style={{
                          position: 'absolute', right: '10px', top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '13px', fontWeight: '700', color: '#64748b',
                          pointerEvents: 'none',
                        }}>%</span>
                      </div>

                      {/* Botão preview */}
                      {podePreview && (
                        <button
                          onClick={() => gerarPreview(tipo.key)}
                          disabled={p.processando}
                          title="Ver preview"
                          style={{
                            width: '34px', height: '34px', flexShrink: 0,
                            border: 'none', borderRadius: '8px',
                            background: previewAtivo === tipo.key ? tipo.cor : '#f1f5f9',
                            color: previewAtivo === tipo.key ? 'white' : '#64748b',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Status / erro */}
                    {p.erro && (
                      <p style={{ fontSize: '11px', color: '#dc2626', marginTop: '6px', fontWeight: '500' }}>
                        ⚠ {p.erro}
                      </p>
                    )}
                    {p.concluido && (
                      <p style={{ fontSize: '11px', color: '#16a34a', marginTop: '6px', fontWeight: '600' }}>
                        ✓ Processada e baixada com sucesso!
                      </p>
                    )}
                    {p.processando && (
                      <p style={{ fontSize: '11px', color: '#2563eb', marginTop: '6px', fontWeight: '500' }}>
                        ⏳ Processando...
                      </p>
                    )}
                  </div>
                )
              })}

              {/* Botão processar */}
              <button
                onClick={processarTodas}
                disabled={salvando || totalAnexado === 0}
                style={{
                  width: '100%',
                  marginTop: '16px',
                  padding: '13px',
                  background: salvando || totalAnexado === 0
                    ? '#e2e8f0'
                    : 'linear-gradient(135deg, #1e40af, #2563eb)',
                  color: salvando || totalAnexado === 0 ? '#94a3b8' : 'white',
                  border: 'none',
                  borderRadius: '9px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: salvando || totalAnexado === 0 ? 'not-allowed' : 'pointer',
                  boxShadow: salvando || totalAnexado === 0 ? 'none' : '0 4px 12px rgba(30,64,175,0.3)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {salvando ? (
                  <>⏳ Processando planilhas...</>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/>
                      <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Processar e Baixar Planilhas
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Coluna direita: PRÉ VISUALIZAÇÃO */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            overflow: 'hidden',
            minHeight: '500px',
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}>
              <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pré-Visualização da Planilha
              </h2>
              {previewAtivo && (
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {TIPOS.find(t => t.key === previewAtivo)?.label}
                </p>
              )}
            </div>

            <div style={{ padding: '20px' }}>
              {!previewAtivo ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: '400px', gap: '12px',
                }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <p style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center' }}>
                    Anexe uma planilha, insira o percentual<br />e clique no ícone 👁 para visualizar
                  </p>
                </div>
              ) : !previewData ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: '400px', gap: '12px',
                }}>
                  <div style={{ fontSize: '32px' }}>⏳</div>
                  <p style={{ color: '#64748b', fontSize: '14px' }}>Carregando preview...</p>
                </div>
              ) : (
                <div>
                  {/* Cards de resumo */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                    {[
                      { label: 'Valor Original', valor: formatBRL(previewData.valor_original_total), cor: '#0f172a', bg: '#f8fafc' },
                      { label: 'Valor Reduzido', valor: formatBRL(previewData.valor_novo_total), cor: '#16a34a', bg: '#f0fdf4' },
                      { label: 'Redução Total', valor: formatBRL(previewData.reducao_total), cor: '#dc2626', bg: '#fef2f2' },
                    ].map(c => (
                      <div key={c.label} style={{
                        padding: '12px 14px', borderRadius: '8px',
                        background: c.bg, border: '1px solid #e2e8f0',
                      }}>
                        <p style={{ fontSize: '11px', color: '#64748b', fontWeight: '500', marginBottom: '4px' }}>{c.label}</p>
                        <p style={{ fontSize: '15px', fontWeight: '700', color: c.cor }}>{c.valor}</p>
                      </div>
                    ))}
                  </div>

                  {/* Tabela de itens */}
                  <div style={{ overflowY: 'auto', maxHeight: '380px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                        <tr>
                          {['Descrição', 'Valor Original', 'Valor Novo', 'Redução'].map(col => (
                            <th key={col} style={{
                              padding: '10px 14px', textAlign: col === 'Descrição' ? 'left' : 'right',
                              fontSize: '11px', fontWeight: '700', color: '#64748b',
                              textTransform: 'uppercase', letterSpacing: '0.04em',
                              borderBottom: '1px solid #e2e8f0',
                            }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.itens.map((item, i) => (
                          <tr key={i} style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: i % 2 === 0 ? 'white' : '#fafafa',
                          }}>
                            <td style={{ padding: '9px 14px', color: '#334155', maxWidth: '280px' }}>
                              {item.descricao}
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', color: '#475569', fontWeight: '500' }}>
                              {formatBRL(item.valor_original)}
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', color: '#16a34a', fontWeight: '600' }}>
                              {formatBRL(item.valor_novo)}
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', color: '#dc2626', fontWeight: '600' }}>
                              -{formatBRL(item.reducao)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px', textAlign: 'right' }}>
                    Exibindo {previewData.itens.length} de {previewData.total_itens} itens
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
