# LicitaFácil — Guia de Configuração

## PASSO 1 — Configurar o Supabase

1. Acesse https://supabase.com e crie uma conta gratuita
2. Crie um novo projeto
3. Vá em **SQL Editor** e cole o conteúdo do arquivo `supabase_setup.sql` e execute
4. Vá em **Project Settings → API** e copie:
   - `Project URL`
   - `anon public` key

## PASSO 2 — Configurar as variáveis de ambiente

Abra o arquivo `licitacao-app/.env.local` e substitua:

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_AQUI
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## PASSO 3 — Criar o primeiro usuário

No Supabase, vá em **Authentication → Users → Add user** e crie o login.

## PASSO 4 — Iniciar o sistema

Clique duas vezes no arquivo `iniciar.bat`

O sistema abrirá automaticamente em: http://localhost:3000

---

## Estrutura do projeto

```
excel/
├── iniciar.bat              ← Clique aqui para iniciar tudo
├── supabase_setup.sql       ← SQL para configurar banco de dados
├── backend/                 ← API Python (porta 8000)
│   ├── main.py              ← Servidor FastAPI
│   ├── processor.py         ← Lógica de processamento Excel
│   └── requirements.txt
└── licitacao-app/           ← Interface web Next.js (porta 3000)
    └── src/
        ├── app/
        │   ├── login/       ← Tela de login
        │   ├── dashboard/   ← Lista de licitações
        │   └── licitacoes/nova/ ← Cadastro de licitação
        ├── components/
        └── lib/supabase.ts
```
