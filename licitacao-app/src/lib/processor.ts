/**
 * Processador de planilhas de licitação (Excel).
 *
 * Estratégia de preservação de formatação:
 *   - SheetJS é usado APENAS para ler e analisar a estrutura (detectar colunas,
 *     calcular novos valores). Nunca para escrever o arquivo final.
 *   - jszip abre o .xlsx como ZIP, modifica SOMENTE os valores das células
 *     alvo no XML de cada worksheet, e devolve o ZIP inteiro intacto —
 *     preservando logo, estilos, células mescladas, largura de colunas, VBA, etc.
 *
 * Regra de BDI:
 *   - A coluna BDI é lida para calcular o Valor Unit com BDI, mas NUNCA escrita.
 *   - O cálculo: novoComBdi = novoSemBdi × (1 + bdi_decimal)
 *   - Se o valor BDI estiver armazenado como percentual (ex.: 20,91 em vez de
 *     0,2091), o código detecta e normaliza automaticamente.
 */

import * as XLSX from 'xlsx'
import JSZip from 'jszip'

// ─── Interfaces públicas ──────────────────────────────────────────────────────

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

// ─── Interfaces internas ──────────────────────────────────────────────────────

interface Colunas {
  semBdi?: number    // índice (0-based) da coluna "Valor Unit sem BDI" — modificada
  bdi?: number       // índice da coluna "BDI"                          — SOMENTE LEITURA
  comBdi?: number    // índice da coluna "Valor Unit com BDI"           — recalculada
  totalSem?: number  // índice da coluna "Total sem BDI"                — recalculada
  totalCom?: number  // índice da coluna "Total com BDI"                — recalculada
  quant?: number     // índice da coluna "Quant."
  desc?: number      // índice da coluna "Descrição"
}

/** Mapa de mudanças: nome da aba → { referência de célula → novo valor numérico } */
type SheetChanges = Record<string, number>

// ─── Helpers básicos ──────────────────────────────────────────────────────────

function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}

function getValorCelula(ws: XLSX.WorkSheet, r: number, c: number): unknown {
  const cell = ws[XLSX.utils.encode_cell({ r, c })]
  return cell ? cell.v : undefined
}

// ─── Conversão de índice de coluna para letra Excel ───────────────────────────

/**
 * Converte índice de coluna 0-based para letra(s) Excel.
 * Ex.: 0 → "A", 25 → "Z", 26 → "AA", 27 → "AB"
 */
function colToLetter(col: number): string {
  let result = ''
  let n = col + 1 // 1-based
  while (n > 0) {
    const rem = (n - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

/**
 * Retorna a referência de célula no formato "H14" (coluna letra + linha 1-based).
 * row e col são índices 0-based (como usa SheetJS).
 */
function cellAddr(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`
}

// ─── Detecção de colunas ──────────────────────────────────────────────────────

function encontrarColunas(ws: XLSX.WorkSheet): { headerRow: number; cols: Colunas } | null {
  if (!ws['!ref']) return null
  const range = XLSX.utils.decode_range(ws['!ref'])
  const maxRow = Math.min(40, range.e.r)

  // Primeiro passe: procura cabeçalhos padrão SINAPI/SEINFRA
  for (let r = 0; r <= maxRow; r++) {
    const cols: Colunas = {}

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell || typeof cell.v !== 'string') continue
      const val = cell.v.trim().toUpperCase().replace(/\s+/g, ' ')

      if (
        (val.includes('VALOR UNIT') || val.includes('P.UNIT') || val.includes('PREÇO') || val.includes('PRECO') || val === 'SEM BDI') &&
        (val.includes('SEM BDI') || val.includes('S/ BDI') || val.includes('S/BDI'))
      ) {
        cols.semBdi = c
      } else if (['BDI', 'B.D.I', 'B.D.I.'].includes(val)) {
        cols.bdi = c                 // BDI: somente leitura
      } else if (
        (val.includes('VALOR UNIT') || val.includes('P.UNIT') || val === 'COM BDI') &&
        (val.includes('COM BDI') || val.includes('C/ BDI') || val.includes('C/BDI'))
      ) {
        cols.comBdi = c
      } else if (val.includes('TOTAL') && (val.includes('SEM') || val.includes('S/'))) {
        cols.totalSem = c
      } else if (val.includes('TOTAL') && (val.includes('COM') || val.includes('C/'))) {
        cols.totalCom = c
      } else if (val.includes('TOTAL') && cols.totalCom === undefined) {
        cols.totalCom = c
      } else if (['QUANT.', 'QUANT', 'QUANTIDADE', 'QTD', 'QTD.'].includes(val)) {
        cols.quant = c
      } else if (val.includes('DESCRI') || val.includes('DISCRIMIN') || val.includes('SERVIÇO') || val.includes('SERVICO')) {
        cols.desc = c
      }
    }

    if (cols.semBdi !== undefined) {
      return { headerRow: r, cols }
    }
  }

  // Segundo passe: fallback para CPU (P.UNIT. / P.TOTAL)
  for (let r = 0; r <= maxRow; r++) {
    const cols: Colunas = {}
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell || typeof cell.v !== 'string') continue
      const val = cell.v.trim().toUpperCase().replace(/\s+/g, ' ')

      if (['P.UNIT.', 'P. UNIT.', 'P.UNIT', 'VALOR UNIT', 'PRECO UNIT', 'PREÇO UNIT'].includes(val)) {
        cols.semBdi = c
      } else if (['P.TOTAL', 'P. TOTAL', 'P.TOTAL.', 'TOTAL', 'VALOR TOTAL'].includes(val)) {
        cols.totalCom = c
      } else if (['QUANT.', 'QUANT', 'QUANTIDADE', 'QTD'].includes(val)) {
        cols.quant = c
      } else if (val.includes('DESCRI') || val.includes('DISCRIMIN')) {
        cols.desc = c
      }
    }
    if (cols.semBdi !== undefined) {
      return { headerRow: r, cols }
    }
  }

  return null
}

// ─── Modificação de XML do worksheet ─────────────────────────────────────────

/**
 * Substitui o valor de uma célula específica no XML do worksheet.
 *
 * Exemplos de elementos que este regex captura:
 *   <c r="H14" s="12" t="n"><v>129.55</v></c>
 *   <c r="H14" s="12"><f>A14*0.5</f><v>129.55</v></c>
 *   <c s="12" r="H14" t="n"><v>129.55</v></c>
 *
 * Resultado após substituição:
 *   <c r="H14" s="12" t="n"><v>64.78</v></c>   ← fórmula removida, valor estático
 *
 * A tag de abertura (com todos os atributos de estilo) é preservada intacta.
 */
function replaceCellInXml(xml: string, cellRef: string, newValue: number): string {
  // Escapa caracteres especiais de regex na referência da célula
  const esc = cellRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Padrão:
  //   (<c\s[^>]*\br="H14"[^>]*>) — tag de abertura (capturada como $1)
  //   [\s\S]*?                    — qualquer conteúdo (fórmula + valor antigo)
  //   <\/c>                       — tag de fechamento
  const pattern = new RegExp(
    `(<c\\s[^>]*\\br="${esc}"[^>]*>)[\\s\\S]*?<\\/c>`,
    'g'
  )

  return xml.replace(pattern, (_, openTag) => `${openTag}<v>${newValue}</v></c>`)
}

// ─── Mapeamento de abas → arquivos XML no ZIP ─────────────────────────────────

/**
 * Lê xl/workbook.xml e xl/_rels/workbook.xml.rels para descobrir qual arquivo
 * dentro do ZIP corresponde a cada aba (ex.: "Orçamento Sintético" → "worksheets/sheet3.xml").
 */
async function getSheetFilePaths(zip: JSZip): Promise<Map<string, string>> {
  const mapping = new Map<string, string>()

  const workbookFile = zip.file('xl/workbook.xml')
  const relsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (!workbookFile || !relsFile) return mapping

  const workbookXml = await workbookFile.async('string')
  const relsXml = await relsFile.async('string')

  // rId → caminho relativo (ex.: rId3 → "worksheets/sheet3.xml")
  const ridToFile = new Map<string, string>()
  const relRe = /Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = relRe.exec(relsXml)) !== null) {
    if (m[2].startsWith('worksheets/')) {
      ridToFile.set(m[1], m[2])
    }
  }

  // nome da aba → rId → caminho
  const sheetRe = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g
  while ((m = sheetRe.exec(workbookXml)) !== null) {
    const file = ridToFile.get(m[2])
    if (file) mapping.set(m[1], file)
  }

  return mapping
}

// ─── Cálculo das mudanças (SheetJS) ──────────────────────────────────────────

/**
 * Usa SheetJS para encontrar colunas relevantes e calcular os novos valores.
 * Retorna um mapa: nome da aba → { referência de célula → novo valor }.
 *
 * A coluna BDI NUNCA aparece como destino — é apenas lida para o cálculo.
 */
function calcularMudancas(
  wb: XLSX.WorkBook,
  tipo: string,
  percentual: number
): Map<string, SheetChanges> {
  const fator = 1 - percentual / 100
  const allChanges = new Map<string, SheetChanges>()

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws['!ref']) continue

    // Aba de cronograma: reduz todos os valores monetários proporcionalmente
    if (tipo === 'cronograma' && sheetName.toUpperCase().includes('CRONOGRAMA')) {
      const changes = calcularMudancasCronograma(ws, fator)
      if (Object.keys(changes).length > 0) allChanges.set(sheetName, changes)
      continue
    }

    const resultado = encontrarColunas(ws)
    if (!resultado) continue

    const { headerRow, cols } = resultado
    if (cols.semBdi === undefined) continue

    const range = XLSX.utils.decode_range(ws['!ref'])
    const changes: SheetChanges = {}

    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const valSemBdi = getValorCelula(ws, r, cols.semBdi)
      if (typeof valSemBdi !== 'number' || valSemBdi <= 0) continue

      const novoSemBdi = arredondar(valSemBdi * fator)

      // ── semBdi: reduzido pelo fator ────────────────────────────────────────
      changes[cellAddr(r, cols.semBdi)] = novoSemBdi

      // ── BDI: SOMENTE LEITURA — nunca adicionado ao mapa de mudanças ────────
      // Lê o valor atual para calcular o Valor com BDI.
      // Se armazenado como percentual simples (ex.: 20,91) em vez de decimal
      // (0,2091), normaliza dividindo por 100.
      let bdiDecimal: number | null = null
      if (cols.bdi !== undefined) {
        const bdiRaw = getValorCelula(ws, r, cols.bdi)
        if (typeof bdiRaw === 'number' && bdiRaw > 0) {
          bdiDecimal = bdiRaw > 1 ? bdiRaw / 100 : bdiRaw
        }
      }

      if (bdiDecimal !== null && cols.comBdi !== undefined) {
        // ── comBdi: novoSemBdi × (1 + bdi) ───────────────────────────────────
        const novoComBdi = arredondar(novoSemBdi * (1 + bdiDecimal))
        changes[cellAddr(r, cols.comBdi)] = novoComBdi

        if (cols.quant !== undefined) {
          const quant = getValorCelula(ws, r, cols.quant)
          if (typeof quant === 'number' && quant > 0) {
            // ── totalSem: novoSemBdi × quant ─────────────────────────────────
            if (cols.totalSem !== undefined) {
              changes[cellAddr(r, cols.totalSem)] = arredondar(novoSemBdi * quant)
            }
            // ── totalCom: novoComBdi × quant ─────────────────────────────────
            if (cols.totalCom !== undefined) {
              changes[cellAddr(r, cols.totalCom)] = arredondar(novoComBdi * quant)
            }
          }
        }
      } else if (cols.quant !== undefined && cols.totalCom !== undefined) {
        // Fallback sem BDI: totalCom = novoSemBdi × quant
        const quant = getValorCelula(ws, r, cols.quant)
        if (typeof quant === 'number' && quant > 0) {
          changes[cellAddr(r, cols.totalCom)] = arredondar(novoSemBdi * quant)
        }
      }
    }

    if (Object.keys(changes).length > 0) allChanges.set(sheetName, changes)
  }

  return allChanges
}

/**
 * Para abas de cronograma: reduz todos os valores numéricos > 1
 * (interpretados como valores monetários, não percentuais).
 */
function calcularMudancasCronograma(ws: XLSX.WorkSheet, fator: number): SheetChanges {
  const changes: SheetChanges = {}
  if (!ws['!ref']) return changes

  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell || typeof cell.v !== 'number' || cell.v <= 1) continue
      changes[cellAddr(r, c)] = arredondar(cell.v * fator)
    }
  }

  return changes
}

// ─── Processamento principal (ZIP-based) ─────────────────────────────────────

/**
 * Aplica redução percentual nos valores unitários sem BDI e recalcula
 * valores com BDI e totais, preservando TODA a formatação original.
 *
 * Fluxo:
 *   1. SheetJS analisa a estrutura → calcula novos valores
 *   2. jszip abre o .xlsx como ZIP
 *   3. Apenas os valores de célula são substituídos no XML de cada worksheet
 *   4. Todo o resto (estilos, logo, células mescladas, VBA, etc.) permanece intacto
 */
export async function processarPlanilha(
  buffer: Buffer,
  tipo: string,
  percentual: number
): Promise<Buffer> {
  const fator = 1 - percentual / 100  // eslint-disable-line @typescript-eslint/no-unused-vars

  // ── Etapa 1: analisar estrutura com SheetJS ────────────────────────────────
  const wb = XLSX.read(buffer, { type: 'buffer', cellNF: true })
  const allChanges = calcularMudancas(wb, tipo, percentual)

  if (allChanges.size === 0) return buffer   // nenhuma coluna reconhecida → retorna original

  // ── Etapa 2: abrir o xlsx como ZIP ────────────────────────────────────────
  const zip = await JSZip.loadAsync(buffer)

  // ── Etapa 3: mapear nome da aba → arquivo XML dentro do ZIP ───────────────
  const sheetFilePaths = await getSheetFilePaths(zip)

  // ── Etapa 4: aplicar mudanças somente nos XMLs das abas afetadas ──────────
  for (const [sheetName, changes] of allChanges) {
    const relativePath = sheetFilePaths.get(sheetName)
    if (!relativePath) continue

    const fullPath = `xl/${relativePath}`
    const sheetZipEntry = zip.file(fullPath)
    if (!sheetZipEntry) continue

    let xml = await sheetZipEntry.async('string')

    for (const [cellRef, newValue] of Object.entries(changes)) {
      xml = replaceCellInXml(xml, cellRef, newValue)
    }

    zip.file(fullPath, xml)
  }

  // ── Etapa 5: gerar buffer final com TODOS os arquivos do ZIP intactos ─────
  // (imagens, estilos, células mescladas, largura de colunas, VBA, etc.)
  return await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

// ─── Preview (somente leitura, sem alteração de arquivo) ─────────────────────

export function previewPlanilha(
  buffer: Buffer,
  tipo: string,
  percentual: number
): PreviewResult {
  const fator = 1 - percentual / 100
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const itens: PreviewItem[] = []
  let valorOriginalTotal = 0
  let valorNovoTotal = 0

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws['!ref']) continue

    // Para cronograma, usa lógica específica de preview
    if (tipo === 'cronograma' && sheetName.toUpperCase().includes('CRONOGRAMA')) {
      previewCronograma(ws, fator, itens)
      continue
    }

    const resultado = encontrarColunas(ws)
    if (!resultado) continue

    const { headerRow, cols } = resultado
    if (cols.semBdi === undefined) continue

    const range = XLSX.utils.decode_range(ws['!ref'])

    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const valSemBdi = getValorCelula(ws, r, cols.semBdi)
      if (typeof valSemBdi !== 'number' || valSemBdi <= 0) continue

      const novoValor = arredondar(valSemBdi * fator)
      valorOriginalTotal += valSemBdi
      valorNovoTotal += novoValor

      if (itens.length < 100) {
        let descricao = `Item ${itens.length + 1}`
        if (cols.desc !== undefined) {
          const desc = getValorCelula(ws, r, cols.desc)
          if (typeof desc === 'string' && desc.trim()) {
            descricao = desc.trim().length > 65 ? desc.trim().slice(0, 62) + '...' : desc.trim()
          }
        }
        itens.push({
          descricao,
          valor_original: arredondar(valSemBdi),
          valor_novo: novoValor,
          reducao: arredondar(valSemBdi - novoValor),
        })
      }
    }
  }

  return {
    itens,
    total_itens: itens.length,
    valor_original_total: arredondar(valorOriginalTotal),
    valor_novo_total: arredondar(valorNovoTotal),
    reducao_total: arredondar(valorOriginalTotal - valorNovoTotal),
    percentual,
  }
}

function previewCronograma(
  ws: XLSX.WorkSheet,
  fator: number,
  itens: PreviewItem[]
): void {
  if (!ws['!ref']) return
  const range = XLSX.utils.decode_range(ws['!ref'])
  let contador = 0

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell || typeof cell.v !== 'number' || cell.v <= 1) continue
      if (itens.length >= 100) return

      const novoValor = arredondar(cell.v * fator)
      itens.push({
        descricao: `Célula ${cellAddr(r, c)}`,
        valor_original: arredondar(cell.v),
        valor_novo: novoValor,
        reducao: arredondar(cell.v - novoValor),
      })
      contador++
    }
    if (contador > 50) return // limita preview do cronograma
  }
}
