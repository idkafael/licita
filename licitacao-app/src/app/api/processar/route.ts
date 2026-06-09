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

    const tipoArquivo = detectarTipo(arquivo.name)
    if (tipoArquivo === 'desconhecido') {
      return NextResponse.json({ error: 'Formato não suportado. Use .xlsx, .xls, .xlsm ou .pdf' }, { status: 400 })
    }

    const arrayBuffer = await arquivo.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const nomeSemExt = arquivo.name.replace(/\.[^/.]+$/, '')
    const ext = arquivo.name.split('.').pop()?.toLowerCase() ?? 'xlsx'
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
    const tipoExcel = tipo && tiposValidos.includes(tipo) ? tipo : 'licitacao'
    const resultado = processarPlanilha(buffer, tipoExcel, percentual)

    return new NextResponse(resultado.buffer as ArrayBuffer, {
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
