import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Licitacao = {
  id: string
  user_id: string
  nome: string
  orgao: string
  valor_original: number | null
  valor_reduzido: number | null
  status: 'pendente' | 'processando' | 'concluido' | 'erro'
  created_at: string
}

export type Planilha = {
  id: string
  licitacao_id: string
  tipo: 'licitacao' | 'orcamento_resumido' | 'cpu' | 'cronograma'
  percentual_reducao: number
  arquivo_original_url: string | null
  arquivo_gerado_url: string | null
  nome_arquivo: string
  created_at: string
}
