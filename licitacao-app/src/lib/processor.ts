import * as XLSX from 'xlsx'

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

interface Colunas {
  semBdi?: number
  bdi?: number
  comBdi?: number
  totalSem?: number
  totalCom?: number
  quant?: number
  desc?: number
}

function getValorCelula(ws: XLSX.WorkSheet, r: number, c: number): unknown {
  const cell = ws[XLSX.utils.encode_cell({ r, c })]
  return cell ? cell.v : undefined
}

function setCelula(ws: XLSX.WorkSheet, r: number, c: number, valor: number) {
  const addr = XLSX.utils.encode_cell({ r, c })
  const cell = ws[addr]
  if (cell) {
    cell.v = valor
    delete cell.f // remover fórmula para garantir que o valor novo seja usado
    cell.t = 'n'
  } else {
    ws[addr] = { v: valor, t: 'n' }
  }
}

function encontrarColunas(ws: XLSX.WorkSheet): { headerRow: number; cols: Colunas } | null {
  if (!ws['!ref']) return null
  const range = XLSX.utils.decode_range(ws['!ref'])
  const maxRow = Math.min(40, range.e.r)

  for (let r = 0; r <= maxRow; r++) {
    const cols: Colunas = {}

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell || typeof cell.v !== 'string') continue
      const val = cell.v.trim().toUpperCase().replace(/\s+/g, ' ')

      if ((val.includes('VALOR UNIT') || val.includes('P.UNIT') || val.includes('PRECO') || val.includes('PREÇO') || val === 'SEM BDI') &&
          (val.includes('SEM BDI') || val.includes('S/ BDI') || val.includes('S/BDI'))) {
        cols.semBdi = c
      } else if (['BDI', 'B.D.I', 'B.D.I.'].includes(val)) {
        cols.bdi = c
      } else if ((val.includes('VALOR UNIT') || val.includes('P.UNIT') || val.includes('COM BDI') || val === 'COM BDI') &&
                 (val.includes('COM BDI') || val.includes('C/ BDI') || val.includes('C/BDI'))) {
        cols.comBdi = c
      } else if (val.includes('TOTAL') && val.includes('SEM')) {
        cols.totalSem = c
      } else if (val.includes('TOTAL') && val.includes('COM')) {
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

  // Fallback: tentar detectar pela coluna P.UNIT. (CPU)
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

function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}

export function processarPlanilha(buffer: Buffer, tipo: string, percentual: number): Buffer {
  const fator = 1 - percentual / 100
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellNF: true, cellStyles: true })

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws['!ref']) continue

    // Para cronograma, processar valores monetários proporcionalmente
    if (tipo === 'cronograma' && sheetName.toUpperCase().includes('CRONOGRAMA')) {
      processarCronograma(ws, fator)
      continue
    }

    const resultado = encontrarColunas(ws)
    if (!resultado) continue

    const { headerRow, cols } = resultado
    const range = XLSX.utils.decode_range(ws['!ref'])

    for (let r = headerRow + 1; r <= range.e.r; r++) {
      if (cols.semBdi === undefined) continue
      const valSemBdi = getValorCelula(ws, r, cols.semBdi)
      if (typeof valSemBdi !== 'number' || valSemBdi <= 0) continue

      const novoSemBdi = arredondar(valSemBdi * fator)
      setCelula(ws, r, cols.semBdi, novoSemBdi)

      // Recalcular valor com BDI
      if (cols.bdi !== undefined && cols.comBdi !== undefined) {
        const bdiVal = getValorCelula(ws, r, cols.bdi)
        if (typeof bdiVal === 'number') {
          const novoComBdi = arredondar(novoSemBdi * (1 + bdiVal))
          setCelula(ws, r, cols.comBdi, novoComBdi)

          // Recalcular totais
          if (cols.quant !== undefined) {
            const quant = getValorCelula(ws, r, cols.quant)
            if (typeof quant === 'number' && quant > 0) {
              if (cols.totalSem !== undefined) {
                setCelula(ws, r, cols.totalSem, arredondar(novoSemBdi * quant))
              }
              if (cols.totalCom !== undefined) {
                setCelula(ws, r, cols.totalCom, arredondar(novoComBdi * quant))
              }
            }
          }
        }
      } else if (cols.quant !== undefined && cols.totalCom !== undefined) {
        const quant = getValorCelula(ws, r, cols.quant)
        if (typeof quant === 'number' && quant > 0) {
          setCelula(ws, r, cols.totalCom, arredondar(novoSemBdi * quant))
        }
      }
    }
  }

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }))
}

function processarCronograma(ws: XLSX.WorkSheet, fator: number) {
  if (!ws['!ref']) return
  const range = XLSX.utils.decode_range(ws['!ref'])

  // Encontrar coluna "Valor (R$)"
  let colValor: number | undefined
  let headerRow = 0

  for (let r = 0; r <= Math.min(20, range.e.r); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell || typeof cell.v !== 'string') continue
      const val = cell.v.trim().toUpperCase()
      if (['VALOR (R$)', 'VALOR', 'R$', 'TOTAL'].includes(val)) {
        colValor = c
        headerRow = r
        break
      }
    }
    if (colValor !== undefined) break
  }

  if (colValor === undefined) return

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell || typeof cell.v !== 'number') continue
      if (cell.v > 1) { // Valor monetário (não percentual)
        cell.v = arredondar(cell.v * fator)
        delete cell.f
      }
    }
  }
}

export function previewPlanilha(buffer: Buffer, tipo: string, percentual: number): PreviewResult {
  const fator = 1 - percentual / 100
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const itens: PreviewItem[] = []
  let valorOriginalTotal = 0
  let valorNovoTotal = 0

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws['!ref']) continue

    const resultado = encontrarColunas(ws)
    if (!resultado) continue

    const { headerRow, cols } = resultado
    const range = XLSX.utils.decode_range(ws['!ref'])

    for (let r = headerRow + 1; r <= range.e.r; r++) {
      if (cols.semBdi === undefined) continue
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
