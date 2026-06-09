import { NextRequest, NextResponse } from 'next/server'
import { processarPlanilha } from '@/lib/processor'
import { processarPDF } from '@/lib/pdf-processor'

export const maxDuration = 60 // segundos — necessário para arquivos grandes

function detectarTipo(filename: string): 'pdf' | 'excel' | 'desconhecido' {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['xlsx', 'xls', 'xlsm'].includes(ext)) return 'excel'
  return 'desconhecido'
}

export async function POST(request: NextRequest) {
  try {
    // Lê parâmetros da query string (evita o parser multipart que tem limite de 1MB)
    const { searchParams } = new URL(request.url)
    const filename   = searchParams.get('filename')    ?? 'arquivo'
    const percentualStr = searchParams.get('percentual')
    const tipo       = searchParams.get('tipo')        ?? 'licitacao'

    if (!percentualStr) {
      return NextResponse.json({ error: 'Parâmetro obrigatório: percentual' }, { status: 400 })
    }

    const percentual = parseFloat(percentualStr)
    if (isNaN(percentual) || percentual <= 0 || percentual >= 100) {
      return NextResponse.json({ error: 'Percentual deve ser entre 0 e 100' }, { status: 400 })
    }

    const tipoArquivo = detectarTipo(filename)
    if (tipoArquivo === 'desconhecido') {
      return NextResponse.json({ error: 'Formato não suportado. Use .xlsx, .xls, .xlsm ou .pdf' }, { status: 400 })
    }

    // Lê o corpo como binary puro — sem parser multipart, sem limite
    const arrayBuffer = await request.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const nomeSemExt = filename.replace(/\.[^/.]+$/, '')
    const ext = filename.split('.').pop()?.toLowerCase() ?? 'xlsx'
    const nomeSaida = `${nomeSemExt}_reduzido_${percentual}pct.${ext}`

    if (tipoArquivo === 'pdf') {
      const resultado = await processarPDF(buffer, percentual)
      return new NextResponse(resultado.buffer as ArrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${nomeSaida}"`,
        },
      })
    }

    // Excel
    const tiposValidos = ['licitacao', 'orcamento_resumido', 'cpu', 'cronograma']
    const tipoExcel = tiposValidos.includes(tipo) ? tipo : 'licitacao'
    const resultado = await processarPlanilha(buffer, tipoExcel, percentual)

    return new NextResponse(new Uint8Array(resultado), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nomeSaida}"`,
      },
    })
  } catch (error) {
    console.error('Erro ao processar arquivo:', error)
    return NextResponse.json({ error: 'Erro interno ao processar o arquivo.' }, { status: 500 })
  }
}
