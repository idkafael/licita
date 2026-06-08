import { NextRequest, NextResponse } from 'next/server'
import { processarPlanilha } from '@/lib/processor'

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

    const tiposValidos = ['licitacao', 'orcamento_resumido', 'cpu', 'cronograma']
    if (!tiposValidos.includes(tipo)) {
      return NextResponse.json({ error: `Tipo inválido. Use: ${tiposValidos.join(', ')}` }, { status: 400 })
    }

    const arrayBuffer = await arquivo.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const resultado = processarPlanilha(buffer, tipo, percentual)

    const nomeOriginal = arquivo.name || 'planilha.xlsx'
    const nomeSemExt = nomeOriginal.replace(/\.[^/.]+$/, '')
    const ext = nomeOriginal.split('.').pop() || 'xlsx'
    const nomeSaida = `${nomeSemExt}_reduzido_${percentual}pct.${ext}`

    return new NextResponse(resultado.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nomeSaida}"`,
      },
    })
  } catch (error) {
    console.error('Erro ao processar planilha:', error)
    return NextResponse.json({ error: 'Erro interno ao processar a planilha.' }, { status: 500 })
  }
}
