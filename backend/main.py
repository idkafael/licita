from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import uvicorn
from processor import processar_planilha, preview_planilha

app = FastAPI(title="Licitação API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    Processa a planilha aplicando a redução percentual.
    Retorna o arquivo Excel modificado.
    """
    if percentual <= 0 or percentual >= 100:
        raise HTTPException(status_code=400, detail="Percentual deve ser entre 0 e 100")

    tipos_validos = ['licitacao', 'orcamento_resumido', 'cpu', 'cronograma']
    if tipo not in tipos_validos:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Use: {tipos_validos}")

    conteudo = await arquivo.read()
    resultado = processar_planilha(conteudo, tipo, percentual)

    nome_original = arquivo.filename or "planilha.xlsx"
    nome_sem_ext = nome_original.rsplit('.', 1)[0]
    extensao = nome_original.rsplit('.', 1)[-1] if '.' in nome_original else 'xlsx'
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
    Gera preview das alterações sem salvar o arquivo.
    """
    if percentual <= 0 or percentual >= 100:
        raise HTTPException(status_code=400, detail="Percentual deve ser entre 0 e 100")

    conteudo = await arquivo.read()
    resultado = preview_planilha(conteudo, tipo, percentual)
    return resultado


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
