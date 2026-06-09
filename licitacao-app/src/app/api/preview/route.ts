import { NextRequest, NextResponse } from 'next/server'
import { previewPlanilha } from '@/lib/processor'
import { previewPDF } from '@/lib/pdf-processor'

export const maxDuration = 60

function detectarTipo(filename: string): 'pdf' | 'excel' {
  return filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'excel'
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const arquivo = formData.get('arquivo') as File | null
    const tipo = formData.get('tipo') as string | null
    const percentualStr = formData.get('percentual') as string | null

    if (!arquivo || !percentualStr) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios: arquivo, percentual' }, { status: 400 })
    }

    const percentual = parseFloat(percentualStr)
    if (isNaN(percentual) || percentual <= 0 || percentual >= 100) {
      return NextResponse.json({ error: 'Percentual deve ser entre 0 e 100' }, { status: 400 })
    }

    const arrayBuffer = await arquivo.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const tipoArquivo = detectarTipo(arquivo.name)

    if (tipoArquivo === 'pdf') {
      const resultado = await previewPDF(buffer, percentual)
      return NextResponse.json(resultado)
    }

    // Excel
    const tiposValidos = ['licitacao', 'orcamento_resumido', 'cpu', 'cronograma']
    const tipoExcel = tipo && tiposValidos.includes(tipo) ? tipo : 'licitacao'
    const resultado = previewPlanilha(buffer, tipoExcel, percentual)
    return NextResponse.json(resultado)
  } catch (error) {
    console.error('Erro ao gerar preview:', error)
    return NextResponse.json({ error: 'Erro interno ao gerar preview.' }, { status: 500 })
  }
}
