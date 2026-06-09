from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import uvicorn
from processor import processar_planilha, preview_planilha
from pdf_processor import processar_pdf, preview_pdf

app = FastAPI(title="Licitação API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EXTENSOES_EXCEL = {'xlsx', 'xls', 'xlsm'}
EXTENSOES_PDF = {'pdf'}


def detectar_tipo_arquivo(filename: str) -> str:
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext in EXTENSOES_PDF:
        return 'pdf'
    if ext in EXTENSOES_EXCEL:
        return 'excel'
    return 'desconhecido'


@app.get("/")
def root():
    return {"status": "ok", "message": "API de Licitação funcionando"}


@app.post("/processar")
async def processar(
    arquivo: UploadFile = File(...),
    tipo: str = Form(...),
    percentual: float = Form(...)
):
    """
    Processa o arquivo (Excel ou PDF) aplicando a redução percentual.
    Retorna o mesmo formato do arquivo de entrada.
    """
    if percentual <= 0 or percentual >= 100:
        raise HTTPException(status_code=400, detail="Percentual deve ser entre 0 e 100")

    nome_original = arquivo.filename or "arquivo"
    tipo_arquivo = detectar_tipo_arquivo(nome_original)

    if tipo_arquivo == 'desconhecido':
        raise HTTPException(status_code=400, detail="Formato não suportado. Use Excel (.xlsx, .xls, .xlsm) ou PDF (.pdf)")

    conteudo = await arquivo.read()
    nome_sem_ext = nome_original.rsplit('.', 1)[0]
    extensao = nome_original.rsplit('.', 1)[-1].lower()

    if tipo_arquivo == 'pdf':
        resultado = processar_pdf(conteudo, percentual)
        nome_saida = f"{nome_sem_ext}_reduzido_{percentual}pct.pdf"
        content_type = "application/pdf"
    else:
        tipos_validos = ['licitacao', 'orcamento_resumido', 'cpu', 'cronograma']
        if tipo not in tipos_validos:
            raise HTTPException(status_code=400, detail=f"Tipo inválido para Excel. Use: {tipos_validos}")
        resultado = processar_planilha(conteudo, tipo, percentual)
        nome_saida = f"{nome_sem_ext}_reduzido_{percentual}pct.{extensao}"
        content_type = (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            if extensao == "xlsx"
            else "application/vnd.ms-excel.sheet.macroEnabled.12"
        )

    return Response(
        content=resultado,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{nome_saida}"'}
    )


@app.post("/preview")
async def preview(
    arquivo: UploadFile = File(...),
    tipo: str = Form(...),
    percentual: float = Form(...)
):
    """
    Gera preview das alterações sem modificar o arquivo.
    Suporta Excel e PDF.
    """
    if percentual <= 0 or percentual >= 100:
        raise HTTPException(status_code=400, detail="Percentual deve ser entre 0 e 100")

    nome_original = arquivo.filename or "arquivo"
    tipo_arquivo = detectar_tipo_arquivo(nome_original)
    conteudo = await arquivo.read()

    if tipo_arquivo == 'pdf':
        resultado = preview_pdf(conteudo, percentual)
    else:
        resultado = preview_planilha(conteudo, tipo, percentual)

    return resultado


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
