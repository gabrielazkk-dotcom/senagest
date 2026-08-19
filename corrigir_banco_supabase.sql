-- ============================================================
-- TECGEST - Correção do banco após importar CSV de produtos
-- Rode este arquivo no Supabase SQL Editor.
-- Ele preserva os produtos importados e cria as colunas/tabelas
-- necessárias para o app funcionar.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Produtos importados por CSV precisam de id para o app selecionar,
-- editar e dar baixa nos materiais.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

UPDATE public.produtos
SET id = gen_random_uuid()
WHERE id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'produtos_pkey'
      AND conrelid = 'public.produtos'::regclass
  ) THEN
    ALTER TABLE public.produtos ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.produtos
  ALTER COLUMN quantidade TYPE NUMERIC(10,2) USING quantidade::numeric,
  ALTER COLUMN estoque_minimo TYPE NUMERIC(10,2) USING estoque_minimo::numeric;

UPDATE public.produtos SET ativo = true WHERE ativo IS NULL;
UPDATE public.produtos SET quantidade = 0 WHERE quantidade IS NULL;
UPDATE public.produtos SET estoque_minimo = 1 WHERE estoque_minimo IS NULL;

-- Clientes usados em serviços e orçamentos.
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Perfis dos usuários logados. Se você já usa auth do Supabase,
-- o id deve ser o mesmo do usuário autenticado.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tecnico' CHECK (role IN ('tecnico', 'admin')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Histórico de entradas/saídas. A página Serviços grava aqui.
CREATE TABLE IF NOT EXISTS public.movimentacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  cliente_id UUID REFERENCES public.clientes(id),
  tecnico_id UUID REFERENCES public.profiles(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
  quantidade NUMERIC(10,2) NOT NULL,
  observacao TEXT,
  referencia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Orçamentos e itens.
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero SERIAL,
  cliente_id UUID REFERENCES public.clientes(id),
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT,
  cliente_endereco TEXT,
  descricao TEXT NOT NULL,
  validade DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado', 'em_execucao', 'finalizado')),
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  desconto NUMERIC(10,2) NOT NULL DEFAULT 0,
  mao_de_obra NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  tecnico_id UUID REFERENCES public.profiles(id),
  aprovado_em TIMESTAMPTZ,
  finalizado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orcamento_itens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orcamento_id UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES public.produtos(id),
  nome TEXT NOT NULL,
  quantidade NUMERIC(10,2) NOT NULL,
  valor_unitario NUMERIC(10,2) NOT NULL,
  desconto NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Função que dá baixa automática no estoque quando uma movimentação é criada.
CREATE OR REPLACE FUNCTION public.handle_movimentacao()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'saida' THEN
    UPDATE public.produtos
    SET quantidade = quantidade - NEW.quantidade
    WHERE id = NEW.produto_id;
  ELSIF NEW.tipo = 'entrada' THEN
    UPDATE public.produtos
    SET quantidade = quantidade + NEW.quantidade
    WHERE id = NEW.produto_id;
  ELSIF NEW.tipo = 'ajuste' THEN
    UPDATE public.produtos
    SET quantidade = NEW.quantidade
    WHERE id = NEW.produto_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_movimentacao_created ON public.movimentacoes;
CREATE TRIGGER on_movimentacao_created
  AFTER INSERT ON public.movimentacoes
  FOR EACH ROW EXECUTE FUNCTION public.handle_movimentacao();

CREATE INDEX IF NOT EXISTS idx_produtos_nome ON public.produtos(nome);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto ON public.movimentacoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_referencia ON public.movimentacoes(referencia);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_created ON public.movimentacoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON public.orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_created ON public.orcamentos(created_at DESC);

-- Libera acesso para usuários autenticados. Para começar simples,
-- técnicos logados podem ler e gravar; depois dá para apertar as regras.
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS produtos_all_authenticated ON public.produtos;
CREATE POLICY produtos_all_authenticated ON public.produtos
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS clientes_all_authenticated ON public.clientes;
CREATE POLICY clientes_all_authenticated ON public.clientes
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS profiles_all_authenticated ON public.profiles;
CREATE POLICY profiles_all_authenticated ON public.profiles
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS movimentacoes_all_authenticated ON public.movimentacoes;
CREATE POLICY movimentacoes_all_authenticated ON public.movimentacoes
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS orcamentos_all_authenticated ON public.orcamentos;
CREATE POLICY orcamentos_all_authenticated ON public.orcamentos
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS orcamento_itens_all_authenticated ON public.orcamento_itens;
CREATE POLICY orcamento_itens_all_authenticated ON public.orcamento_itens
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
