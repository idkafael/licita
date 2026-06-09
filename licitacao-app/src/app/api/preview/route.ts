import { NextRequest, NextResponse } from 'next/server'
import { previewPlanilha } from '@/lib/processor'
import { previewPDF } from '@/lib/pdf-processor'

export const maxDuration = 60

function detectarTipo(filename: string): 'pdf' | 'excel' {
  return filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'excel'
}

export async function POST(request: NextRequest) {
  try {
    // Lê parâmetros da query string (evita o parser multipart que tem limite de 1MB)
    const { searchParams } = new URL(request.url)
    const filename      = searchParams.get('filename')    ?? 'arquivo'
    const percentualStr = searchParams.get('percentual')
    const tipo          = searchParams.get('tipo')        ?? 'licitacao'

    if (!percentualStr) {
      return NextResponse.json({ error: 'Parâmetro obrigatório: percentual' }, { status: 400 })
    }

    const percentual = parseFloat(percentualStr)
    if (isNaN(percentual) || percentual <= 0 || percentual >= 100) {
      return NextResponse.json({ error: 'Percentual deve ser entre 0 e 100' }, { status: 400 })
    }

    // Lê o corpo como binary puro — sem parser multipart, sem limite
    const arrayBuffer = await request.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const tipoArquivo = detectarTipo(filename)

    if (tipoArquivo === 'pdf') {
      const resultado = await previewPDF(buffer, percentual)
      return NextResponse.json(resultado)
    }

    // Excel
    const tiposValidos = ['licitacao', 'orcamento_resumido', 'cpu', 'cronograma']
    const tipoExcel = tiposValidos.includes(tipo) ? tipo : 'licitacao'
    const resultado = previewPlanilha(buffer, tipoExcel, percentual)
    return NextResponse.json(resultado)
  } catch (error) {
    console.error('Erro ao gerar preview:', error)
    return NextResponse.json({ error: 'Erro interno ao gerar preview.' }, { status: 500 })
  }
}
