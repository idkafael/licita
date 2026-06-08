-- ==============================================
-- SETUP DO BANCO DE DADOS - LICITAFÁCIL
-- Execute isso no SQL Editor do Supabase
-- ==============================================

-- Tabela de licitações
CREATE TABLE IF NOT EXISTS licitacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  orgao TEXT NOT NULL,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de planilhas
CREATE TABLE IF NOT EXISTS planilhas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID REFERENCES licitacoes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('licitacao', 'orcamento_resumido', 'cpu', 'cronograma')),
  percentual_reducao NUMERIC(5,2) NOT NULL,
  arquivo_original_url TEXT,
  arquivo_gerado_url TEXT,
  nome_arquivo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security) — cada usuário vê só suas licitações
ALTER TABLE licitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE planilhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê suas licitações" ON licitacoes
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Usuário vê suas planilhas" ON planilhas
  FOR ALL USING (
    licitacao_id IN (SELECT id FROM licitacoes WHERE user_id = auth.uid())
  );

-- Storage bucket para arquivos
INSERT INTO storage.buckets (id, name, public)
VALUES ('planilhas', 'planilhas', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Upload de planilhas" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'planilhas' AND auth.role() = 'authenticated');

CREATE POLICY "Leitura de planilhas" ON storage.objects
  FOR SELECT USING (bucket_id = 'planilhas');
