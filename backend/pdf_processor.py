"""
Processador de PDF para planilhas de licitação.
Aplica redução percentual nos valores "Preço Unitário Sem BDI",
recalcula "Com BDI" e "Total" mantendo o layout original do PDF.
"""

import io
import re
import pdfplumber
import pypdf
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, A4
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.units import mm


def parse_brl(text: str) -> float | None:
    """Converte 'R$ 1.234,56' ou '1.234,56' para float."""
    if not text:
        return None
    cleaned = re.sub(r'[R$\s]', '', text).replace('.', '').replace(',', '.')
    try:
        v = float(cleaned)
        return v if v > 0 else None
    except ValueError:
        return None


def format_brl(value: float) -> str:
    """Converte float para 'R$ 1.234,56'."""
    inteiro, decimal = f"{value:.2f}".split('.')
    inteiro_fmt = ''
    for i, c in enumerate(reversed(inteiro)):
        if i and i % 3 == 0:
            inteiro_fmt = '.' + inteiro_fmt
        inteiro_fmt = c + inteiro_fmt
    return f"R$ {inteiro_fmt},{decimal}"


def detectar_colunas_x(page) -> dict:
    """
    Detecta os intervalos de X de cada coluna monetária
    a partir do cabeçalho da tabela.
    """
    words = page.extract_words()
    col = {'sem_bdi': None, 'com_bdi': None, 'total': None, 'quant': None}

    for i, w in enumerate(words):
        txt = w['text'].upper()
        prev_texts = [words[j]['text'].upper() for j in range(max(0, i-4), i)]

        if txt == 'BDI':
            if 'SEM' in prev_texts:
                col['sem_bdi'] = (w['x0'] - 50, w['x1'] + 60)
            elif 'COM' in prev_texts:
                col['com_bdi'] = (w['x0'] - 50, w['x1'] + 60)
        elif txt in ('TOTAL', 'TOTAL\nR$') and col['total'] is None:
            col['total'] = (w['x0'] - 10, w['x1'] + 80)
        elif txt in ('QUANTIDADE', 'QUANT', 'QUANT.'):
            col['quant'] = (w['x0'] - 5, w['x1'] + 20)

    return col


def agrupar_por_linha(words: list, tolerancia_y: float = 3.0) -> list[list]:
    """Agrupa palavras por linha (mesmo top ± tolerância)."""
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: (round(w['top'] / tolerancia_y), w['x0']))
    linhas = []
    linha_atual = [sorted_words[0]]
    top_atual = sorted_words[0]['top']

    for w in sorted_words[1:]:
        if abs(w['top'] - top_atual) <= tolerancia_y:
            linha_atual.append(w)
        else:
            linhas.append(linha_atual)
            linha_atual = [w]
            top_atual = w['top']
    linhas.append(linha_atual)
    return linhas


def palavras_na_coluna(linha: list, x_range: tuple) -> list:
    """Retorna palavras de uma linha que estão dentro do intervalo X."""
    if not x_range:
        return []
    x_min, x_max = x_range
    return [w for w in linha if w['x0'] >= x_min - 5 and w['x1'] <= x_max + 10]


def reconstruir_valor(palavras: list) -> tuple[float | None, dict | None]:
    """
    Extrai o valor numérico de uma lista de palavras (ex: ['R$', '468,67']).
    Retorna (valor, word_do_número).
    """
    texto_completo = ' '.join(w['text'] for w in palavras)
    valor = parse_brl(texto_completo)

    # Encontrar a palavra que contém o número para pegar a posição
    for w in reversed(palavras):
        if re.search(r'\d', w['text']):
            return valor, w
    return valor, palavras[-1] if palavras else None


def processar_pdf(pdf_bytes: bytes, percentual: float) -> bytes:
    """
    Processa o PDF aplicando redução percentual nos valores SEM BDI.
    Recalcula COM BDI e TOTAL proporcionalmente.
    Retorna o PDF modificado com overlay de novos valores.
    """
    fator = 1 - percentual / 100

    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    writer = pypdf.PdfWriter()

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_idx, plumber_page in enumerate(pdf.pages):
            pdf_page = reader.pages[page_idx]
            page_width = float(plumber_page.width)
            page_height = float(plumber_page.height)

            # Detectar colunas
            cols = detectar_colunas_x(plumber_page)

            # Se não encontrou colunas SEM BDI, não processar esta página
            if not cols['sem_bdi']:
                writer.add_page(pdf_page)
                continue

            # Agrupar palavras por linha
            words = plumber_page.extract_words()
            linhas = agrupar_por_linha(words)

            # Lista de substituições a fazer: (x0, y_pdf, x1, y_bottom, novo_texto, font_size)
            substituicoes = []

            for linha in linhas:
                # Verificar se esta linha tem valor SEM BDI
                pals_sem = palavras_na_coluna(linha, cols['sem_bdi'])
                if not pals_sem:
                    continue

                valor_sem, word_sem = reconstruir_valor(pals_sem)
                if not valor_sem or valor_sem <= 0:
                    continue

                # Calcular novo valor SEM BDI
                novo_sem = round(valor_sem * fator, 2)

                # Verificar se tem COM BDI para calcular ratio
                pals_com = palavras_na_coluna(linha, cols['com_bdi'])
                valor_com, word_com = reconstruir_valor(pals_com) if pals_com else (None, None)

                novo_com = None
                if valor_com and valor_com > 0 and valor_sem > 0:
                    ratio_bdi = valor_com / valor_sem
                    novo_com = round(novo_sem * ratio_bdi, 2)

                # Calcular novo TOTAL
                pals_total = palavras_na_coluna(linha, cols['total'])
                valor_total, word_total = reconstruir_valor(pals_total) if pals_total else (None, None)

                novo_total = None
                if valor_total and valor_com and valor_com > 0:
                    ratio_total_com = valor_total / valor_com
                    if novo_com:
                        novo_total = round(novo_com * ratio_total_com, 2)
                elif valor_total and valor_sem > 0:
                    ratio_total_sem = valor_total / valor_sem
                    novo_total = round(novo_sem * ratio_total_sem, 2)

                # Detectar font size da linha
                font_size = 6.5
                for w in linha:
                    if 'size' in w:
                        font_size = w['size']
                        break

                # Adicionar substituições
                def adicionar_sub(word_orig, pals_orig, novo_valor):
                    if not word_orig or novo_valor is None:
                        return
                    # Pegar posição do grupo todo (do R$ até o número)
                    x0_grupo = min(w['x0'] for w in pals_orig)
                    x1_grupo = max(w['x1'] for w in pals_orig)
                    top = word_orig['top']
                    bottom = word_orig.get('bottom', top + font_size + 1)

                    # Converter coordenadas (pdfplumber: top=0 no topo; pypdf/reportlab: y=0 embaixo)
                    y_bottom_pdf = page_height - bottom
                    y_top_pdf = page_height - top

                    substituicoes.append({
                        'x0': x0_grupo - 2,
                        'x1': x1_grupo + 2,
                        'y_bottom': y_bottom_pdf - 1,
                        'y_top': y_top_pdf + 1,
                        'novo_texto': format_brl(novo_valor),
                        'font_size': font_size,
                    })

                adicionar_sub(word_sem, pals_sem, novo_sem)
                if novo_com is not None and word_com:
                    adicionar_sub(word_com, pals_com, novo_com)
                if novo_total is not None and word_total:
                    adicionar_sub(word_total, pals_total, novo_total)

            if not substituicoes:
                writer.add_page(pdf_page)
                continue

            # Criar overlay com reportlab
            overlay_buffer = io.BytesIO()
            c = canvas.Canvas(overlay_buffer, pagesize=(page_width, page_height))

            for sub in substituicoes:
                largura = sub['x1'] - sub['x0']
                altura = sub['y_top'] - sub['y_bottom']

                # Retângulo branco para cobrir valor antigo
                c.setFillColorRGB(1, 1, 1)
                c.setStrokeColorRGB(1, 1, 1)
                c.rect(
                    sub['x0'], sub['y_bottom'],
                    largura + 2, altura + 2,
                    fill=1, stroke=0
                )

                # Novo valor em preto, alinhado à direita
                c.setFillColorRGB(0, 0, 0)
                font_size = max(5.5, min(sub['font_size'], 8))
                c.setFont('Helvetica', font_size)
                c.drawRightString(
                    sub['x1'] + 1,
                    sub['y_bottom'] + 1,
                    sub['novo_texto']
                )

            c.save()
            overlay_buffer.seek(0)

            # Mesclar overlay com página original
            overlay_reader = pypdf.PdfReader(overlay_buffer)
            overlay_page = overlay_reader.pages[0]
            pdf_page.merge_page(overlay_page)
            writer.add_page(pdf_page)

    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output.read()


def preview_pdf(pdf_bytes: bytes, percentual: float) -> dict:
    """
    Gera preview das alterações no PDF sem modificar o arquivo.
    """
    fator = 1 - percentual / 100
    itens = []
    valor_original_total = 0.0
    valor_novo_total = 0.0

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for plumber_page in pdf.pages:
            cols = detectar_colunas_x(plumber_page)
            if not cols['sem_bdi']:
                continue

            words = plumber_page.extract_words()
            linhas = agrupar_por_linha(words)

            for linha in linhas:
                pals_sem = palavras_na_coluna(linha, cols['sem_bdi'])
                if not pals_sem:
                    continue

                valor_sem, _ = reconstruir_valor(pals_sem)
                if not valor_sem or valor_sem <= 0:
                    continue

                novo_sem = round(valor_sem * fator, 2)
                valor_original_total += valor_sem
                valor_novo_total += novo_sem

                # Tentar pegar descrição (primeira palavra de texto longo na linha)
                descricao = 'Item'
                for w in linha:
                    if len(w['text']) > 5 and not re.search(r'^R\$|^\d', w['text']):
                        descricao = w['text'][:60]
                        break

                if len(itens) < 100:
                    itens.append({
                        'descricao': descricao,
                        'valor_original': round(valor_sem, 2),
                        'valor_novo': novo_sem,
                        'reducao': round(valor_sem - novo_sem, 2),
                    })

    return {
        'itens': itens,
        'total_itens': len(itens),
        'valor_original_total': round(valor_original_total, 2),
        'valor_novo_total': round(valor_novo_total, 2),
        'reducao_total': round(valor_original_total - valor_novo_total, 2),
        'percentual': percentual,
    }
