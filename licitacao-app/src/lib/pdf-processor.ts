/**
 * Processador de PDF para planilhas de licitação.
 * Usa pdfjs-dist para extrair texto com posições
 * e pdf-lib para sobrepor os novos valores no PDF original.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ItemTexto {
  str: string
  x: number
  y: number       // y em coordenadas PDF (0 = base da página)
  width: number
  height: number
}

interface DadosPagina {
  itens: ItemTexto[]
  largura: number
  altura: number
}

interface Substituicao {
  x0: number
  x1: number
  yBase: number   // y base (coordenada PDF, 0 = baixo)
  novoTexto: string
  fontSize: number
}

export interface PreviewItem {
  descricao: string
  valor_original: number
  valor_novo: number
  reducao: number
}

export interface PreviewResult {
  itens: PreviewItem[]
  total_itens: number
  valor_original_total: number
  valor_novo_total: number
  reducao_total: number
  percentual: number
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function parseBRL(texto: string): number | null {
  if (!texto) return null
  const limpo = texto.replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.')
  const valor = parseFloat(limpo)
  return isNaN(valor) || valor <= 0 ? null : valor
}

function formatBRL(valor: number): string {
  const [inteiro, decimal] = valor.toFixed(2).split('.')
  const inteiroFmt = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `R$ ${inteiroFmt},${decimal}`
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}

// ─── Extração de texto via pdfjs-dist ────────────────────────────────────────

async function extrairTextoComPosicoes(buffer: Buffer): Promise<DadosPagina[]> {
  // Dynamic import — usa o build legacy/ESM do pdfjs-dist
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { pathToFileURL } = await import('url')

  // Estratégia: usar o worker copiado em public/ — sempre incluído no Vercel
  // Fallbacks em ordem de prioridade
  const { join } = await import('path')
  const { existsSync } = await import('fs')

  const candidatos = [
    join(process.cwd(), 'public/pdf.worker.mjs'),                          // public/ (Vercel + local)
    join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'), // node_modules local
    '/var/task/public/pdf.worker.mjs',                                     // path absoluto Vercel
  ]

  let workerResolvido = ''
  for (const caminho of candidatos) {
    if (existsSync(caminho)) {
      workerResolvido = pathToFileURL(caminho).href
      break
    }
  }

  if (!workerResolvido) {
    // Último recurso: createRequire
    try {
      const { createRequire } = await import('module')
      const _require = createRequire(import.meta.url)
      workerResolvido = pathToFileURL(_require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href
    } catch {
      throw new Error('Não foi possível localizar o worker do pdfjs-dist')
    }
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerResolvido

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    verbosity: 0,
  })

  const pdfDoc = await loadingTask.promise
  const paginas: DadosPagina[] = []

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const viewport = page.getViewport({ scale: 1.0 })
    const textContent = await page.getTextContent()

    const itens: ItemTexto[] = []
    for (const item of textContent.items) {
      if (!('str' in item) || !item.str.trim()) continue
      itens.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width ?? 0,
        height: item.height ?? 10,
      })
    }

    paginas.push({
      itens,
      largura: viewport.width,
      altura: viewport.height,
    })
  }

  return paginas
}

// ─── Detecção de colunas ─────────────────────────────────────────────────────

interface RangeColuna {
  xMin: number
  xMax: number
}

interface Colunas {
  semBdi?: RangeColuna
  comBdi?: RangeColuna
  total?: RangeColuna
}

function detectarColunas(itens: ItemTexto[]): Colunas {
  const cols: Colunas = {}

  // Agrupar por linha (y similar)
  const linhas = agruparPorLinha(itens)

  for (const linha of linhas) {
    const textos = linha.map(i => i.str.toUpperCase().trim())
    const textoLinha = textos.join(' ')

    if (textoLinha.includes('SEM BDI') || textoLinha.includes('S/ BDI') || textoLinha.includes('S/BDI')) {
      const idx = textos.findIndex(t => t === 'BDI' || t.endsWith('BDI'))
      if (idx >= 0) {
        const item = linha[idx]
        cols.semBdi = { xMin: item.x - 60, xMax: item.x + 80 }
      }
    }
    if (textoLinha.includes('COM BDI') || textoLinha.includes('C/ BDI') || textoLinha.includes('C/BDI')) {
      const idx = textos.findIndex((t, i) => t === 'BDI' && i > 0 && textos[i - 1].includes('COM'))
      if (idx >= 0) {
        const item = linha[idx]
        cols.comBdi = { xMin: item.x - 60, xMax: item.x + 80 }
      }
    }
  }

  // Fallback: usar posições x conhecidas do padrão SINAPI
  if (!cols.semBdi) {
    cols.semBdi  = { xMin: 425, xMax: 475 }
    cols.comBdi  = { xMin: 468, xMax: 515 }
    cols.total   = { xMin: 512, xMax: 560 }
  } else if (!cols.comBdi) {
    // Inferir posições relativas
    const base = cols.semBdi.xMin
    cols.comBdi = { xMin: base + 43, xMax: base + 93 }
    cols.total  = { xMin: base + 87, xMax: base + 140 }
  } else {
    const gap = cols.comBdi.xMin - cols.semBdi.xMin
    cols.total = { xMin: cols.comBdi.xMin + gap, xMax: cols.comBdi.xMax + gap }
  }

  return cols
}

// ─── Agrupamento por linha ────────────────────────────────────────────────────

function agruparPorLinha(itens: ItemTexto[], tolerancia = 3): ItemTexto[][] {
  if (!itens.length) return []
  const ordenados = [...itens].sort((a, b) => {
    const dy = Math.round((b.y - a.y) / tolerancia)
    return dy !== 0 ? dy : a.x - b.x
  })
  const linhas: ItemTexto[][] = []
  let linhaAtual = [ordenados[0]]
  let yAtual = ordenados[0].y

  for (let i = 1; i < ordenados.length; i++) {
    const item = ordenados[i]
    if (Math.abs(item.y - yAtual) <= tolerancia) {
      linhaAtual.push(item)
    } else {
      linhas.push(linhaAtual)
      linhaAtual = [item]
      yAtual = item.y
    }
  }
  linhas.push(linhaAtual)
  return linhas
}

// ─── Encontrar valor na coluna ────────────────────────────────────────────────

function itensDaColuna(linha: ItemTexto[], col: RangeColuna): ItemTexto[] {
  return linha.filter(item => item.x >= col.xMin - 5 && item.x <= col.xMax + 10)
}

function extrairValorDaColuna(linha: ItemTexto[], col: RangeColuna): { valor: number | null; itensBrutos: ItemTexto[] } {
  const itens = itensDaColuna(linha, col)
  if (!itens.length) return { valor: null, itensBrutos: [] }
  const texto = itens.map(i => i.str).join('')
  return { valor: parseBRL(texto), itensBrutos: itens }
}

// ─── Processador principal ────────────────────────────────────────────────────

export async function processarPDF(buffer: Buffer, percentual: number): Promise<Buffer> {
  const fator = 1 - percentual / 100
  const paginas = await extrairTextoComPosicoes(buffer)

  // Carregar PDF com pdf-lib para overlay
  const pdfDoc = await PDFDocument.load(buffer)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  for (let pageIdx = 0; pageIdx < paginas.length; pageIdx++) {
    const { itens, altura } = paginas[pageIdx]
    const pdfPage = pdfDoc.getPage(pageIdx)

    const cols = detectarColunas(itens)
    if (!cols.semBdi) continue

    const linhas = agruparPorLinha(itens)
    const substituicoes: Substituicao[] = []

    for (const linha of linhas) {
      const { valor: valorSem, itensBrutos: itensSem } = extrairValorDaColuna(linha, cols.semBdi)
      if (!valorSem || !itensSem.length) continue

      const novoSem = arredondar(valorSem * fator)

      // Calcular ratio BDI a partir dos valores existentes
      let novoComBdi: number | null = null
      let itensCom: ItemTexto[] = []
      if (cols.comBdi) {
        const { valor: valorCom, itensBrutos } = extrairValorDaColuna(linha, cols.comBdi)
        itensCom = itensBrutos
        if (valorCom && valorSem > 0) {
          const ratioBdi = valorCom / valorSem
          novoComBdi = arredondar(novoSem * ratioBdi)
        }
      }

      let novoTotal: number | null = null
      let itensTotal: ItemTexto[] = []
      if (cols.total) {
        const { valor: valorTotal, itensBrutos } = extrairValorDaColuna(linha, cols.total)
        itensTotal = itensBrutos
        if (valorTotal && novoComBdi) {
          const { valor: valorCom } = extrairValorDaColuna(linha, cols.comBdi!)
          if (valorCom && valorCom > 0) {
            novoTotal = arredondar((valorTotal / valorCom) * novoComBdi)
          }
        } else if (valorTotal && valorSem > 0) {
          novoTotal = arredondar((valorTotal / valorSem) * novoSem)
        }
      }

      // Tamanho da fonte (estimado)
      const fontSize = Math.max(5.5, Math.min(itensSem[0]?.height || 7, 8))

      function criarSub(itensGrupo: ItemTexto[], novoValor: number): Substituicao {
        const x0 = Math.min(...itensGrupo.map(i => i.x)) - 2
        const x1 = Math.max(...itensGrupo.map(i => i.x + i.width)) + 2
        const yBase = itensGrupo[0].y - 1
        return { x0, x1, yBase, novoTexto: formatBRL(novoValor), fontSize }
      }

      substituicoes.push(criarSub(itensSem, novoSem))
      if (novoComBdi !== null && itensCom.length) substituicoes.push(criarSub(itensCom, novoComBdi))
      if (novoTotal !== null && itensTotal.length) substituicoes.push(criarSub(itensTotal, novoTotal))
    }

    // Aplicar substituições no PDF
    for (const sub of substituicoes) {
      const largura = sub.x1 - sub.x0 + 4
      const alturaCaixa = sub.fontSize + 4

      // Retângulo branco cobrindo o valor antigo
      pdfPage.drawRectangle({
        x: sub.x0,
        y: sub.yBase - 2,
        width: largura,
        height: alturaCaixa,
        color: rgb(1, 1, 1),
        opacity: 1,
      })

      // Novo valor alinhado à direita
      const textoLargura = helvetica.widthOfTextAtSize(sub.novoTexto, sub.fontSize)
      pdfPage.drawText(sub.novoTexto, {
        x: sub.x1 - textoLargura,
        y: sub.yBase,
        size: sub.fontSize,
        font: helvetica,
        color: rgb(0, 0, 0),
      })
    }
  }

  const modificado = await pdfDoc.save()
  return Buffer.from(modificado)
}

// ─── Preview ──────────────────────────────────────────────────────────────────

export async function previewPDF(buffer: Buffer, percentual: number): Promise<PreviewResult> {
  const fator = 1 - percentual / 100
  const paginas = await extrairTextoComPosicoes(buffer)

  const itensResult: PreviewItem[] = []
  let totalOriginal = 0
  let totalNovo = 0

  for (const pagina of paginas) {
    const cols = detectarColunas(pagina.itens)
    if (!cols.semBdi) continue

    const linhas = agruparPorLinha(pagina.itens)

    for (const linha of linhas) {
      const { valor: valorSem, itensBrutos } = extrairValorDaColuna(linha, cols.semBdi)
      if (!valorSem || !itensBrutos.length) continue

      const novoSem = arredondar(valorSem * fator)
      totalOriginal += valorSem
      totalNovo += novoSem

      // Pegar descrição (primeiro texto longo da linha)
      let descricao = 'Item'
      for (const item of linha) {
        if (item.str.length > 5 && !/^R\$|\d/.test(item.str.trim())) {
          descricao = item.str.trim().slice(0, 60)
          break
        }
      }

      if (itensResult.length < 100) {
        itensResult.push({
          descricao,
          valor_original: arredondar(valorSem),
          valor_novo: novoSem,
          reducao: arredondar(valorSem - novoSem),
        })
      }
    }
  }

  return {
    itens: itensResult,
    total_itens: itensResult.length,
    valor_original_total: arredondar(totalOriginal),
    valor_novo_total: arredondar(totalNovo),
    reducao_total: arredondar(totalOriginal - totalNovo),
    percentual,
  }
}
