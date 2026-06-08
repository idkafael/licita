import { NextRequest, NextResponse } from 'next/server'
import { previewPlanilha } from '@/lib/processor'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const arquivo = formData.get('arquivo') as File | null
    const tipo = formData.get('tipo') as string | null
    const percentualStr = formData.get('percentual') as string | null

    if (!arquivo || !tipo || !percentualStr) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios: arquivo, tipo, percentual' }, { status: 400 })
    }

    const percentual = parseFloat(percentualStr)
    if (isNaN(percentual) || percentual <= 0 || percentual >= 100) {
      return NextResponse.json({ error: 'Percentual deve ser entre 0 e 100' }, { status: 400 })
    }

    const arrayBuffer = await arquivo.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const resultado = previewPlanilha(buffer, tipo, percentual)

    return NextResponse.json(resultado)
  } catch (error) {
    console.error('Erro ao gerar preview:', error)
    return NextResponse.json({ error: 'Erro interno ao gerar preview.' }, { status: 500 })
  }
}
