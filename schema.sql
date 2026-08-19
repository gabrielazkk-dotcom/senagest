-- ============================================================
-- TECGEST - Schema Completo do Banco de Dados
-- Execute este SQL no Supabase SQL Editor
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA: perfis de usuário
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'tecnico' CHECK (role IN ('tecnico', 'admin')),
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: categorias de produtos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categorias (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome        TEXT NOT NULL UNIQUE,
  descricao   TEXT,
  icone       TEXT DEFAULT 'package',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: produtos / estoque
-- ============================================================
CREATE TABLE IF NOT EXISTS public.produtos (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome            TEXT NOT NULL,
  categoria_id    UUID REFERENCES public.categorias(id),
  marca           TEXT,
  modelo          TEXT,
  quantidade      DECIMAL(10,2) NOT NULL DEFAULT 0,
  estoque_minimo  DECIMAL(10,2) NOT NULL DEFAULT 1,
  unidade         TEXT NOT NULL DEFAULT 'un' CHECK (unidade IN ('un', 'pç', 'm', 'cx', 'rolo', 'par', 'kit')),
  observacoes     TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: clientes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clientes (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome        TEXT NOT NULL,
  telefone    TEXT,
  email       TEXT,
  endereco    TEXT,
  cidade      TEXT,
  observacoes TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: movimentações de estoque
-- ============================================================
CREATE TABLE IF NOT EXISTS public.movimentacoes (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  produto_id    UUID NOT NULL REFERENCES public.produtos(id),
  cliente_id    UUID REFERENCES public.clientes(id),
  tecnico_id    UUID NOT NULL REFERENCES public.profiles(id),
  tipo          TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
  quantidade    DECIMAL(10,2) NOT NULL,
  observacao    TEXT,
  referencia    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: orçamentos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero          SERIAL,
  cliente_id      UUID REFERENCES public.clientes(id),
  cliente_nome    TEXT NOT NULL,
  cliente_telefone TEXT,
  cliente_endereco TEXT,
  descricao       TEXT NOT NULL,
  validade        DATE,
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado', 'em_execucao', 'finalizado')),
  subtotal        DECIMAL(10,2) NOT NULL DEFAULT 0,
  desconto        DECIMAL(10,2) NOT NULL DEFAULT 0,
  mao_de_obra     DECIMAL(10,2) NOT NULL DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL DEFAULT 0,
  observacoes     TEXT,
  tecnico_id      UUID NOT NULL REFERENCES public.profiles(id),
  aprovado_em     TIMESTAMPTZ,
  finalizado_em   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: itens do orçamento
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orcamento_itens (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  orcamento_id    UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  produto_id      UUID REFERENCES public.produtos(id),
  nome            TEXT NOT NULL,
  quantidade      DECIMAL(10,2) NOT NULL,
  valor_unitario  DECIMAL(10,2) NOT NULL,
  desconto        DECIMAL(10,2) NOT NULL DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: kits de instalação
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kits (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome        TEXT NOT NULL,
  descricao   TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: itens dos kits
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kit_itens (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  kit_id      UUID NOT NULL REFERENCES public.kits(id) ON DELETE CASCADE,
  produto_id  UUID NOT NULL REFERENCES public.produtos(id),
  quantidade  DECIMAL(10,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON public.produtos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_produtos_nome ON public.produtos(nome);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto ON public.movimentacoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_cliente ON public.movimentacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_tecnico ON public.movimentacoes(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_created ON public.movimentacoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON public.orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_tecnico ON public.orcamentos(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_created ON public.orcamentos(created_at DESC);

-- ============================================================
-- FUNÇÃO: atualiza updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers updated_at
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_produtos
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_clientes
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_orcamentos
  BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- FUNÇÃO: criar perfil após signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'tecnico')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FUNÇÃO: movimentação atualiza estoque automaticamente
-- ============================================================
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_movimentacao_created
  AFTER INSERT ON public.movimentacoes
  FOR EACH ROW EXECUTE FUNCTION public.handle_movimentacao();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_itens ENABLE ROW LEVEL SECURITY;

-- Profiles: usuário vê seu próprio perfil; admin vê todos
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Categorias: todos autenticados leem; admin escreve
CREATE POLICY "categorias_select" ON public.categorias
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "categorias_write" ON public.categorias
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Produtos: todos autenticados leem; admin escreve
CREATE POLICY "produtos_select" ON public.produtos
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "produtos_write" ON public.produtos
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Clientes: todos autenticados
CREATE POLICY "clientes_all" ON public.clientes
  FOR ALL USING (auth.role() = 'authenticated');

-- Movimentações: todos autenticados leem; técnico/admin inserem
CREATE POLICY "movimentacoes_select" ON public.movimentacoes
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "movimentacoes_insert" ON public.movimentacoes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "movimentacoes_update" ON public.movimentacoes
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Orçamentos: técnico vê seus próprios; admin vê todos
CREATE POLICY "orcamentos_select" ON public.orcamentos
  FOR SELECT USING (
    tecnico_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "orcamentos_insert" ON public.orcamentos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "orcamentos_update" ON public.orcamentos
  FOR UPDATE USING (
    tecnico_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Orçamento itens
CREATE POLICY "orcamento_itens_all" ON public.orcamento_itens
  FOR ALL USING (auth.role() = 'authenticated');

-- Kits: todos leem; admin escreve
CREATE POLICY "kits_select" ON public.kits
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "kits_write" ON public.kits
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));
CREATE POLICY "kit_itens_select" ON public.kit_itens
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "kit_itens_write" ON public.kit_itens
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- ============================================================
-- DADOS INICIAIS - Categorias
-- ============================================================
INSERT INTO public.categorias (nome, descricao, icone) VALUES
  ('Câmeras',           'Câmeras IP, Analógicas, Dome, Bullet',    'camera'),
  ('DVR / NVR',         'Gravadores digitais e de rede',            'hard-drive'),
  ('Cabos',             'Cabos coaxiais, de rede, elétricos',       'cable'),
  ('Fontes',            'Fontes de alimentação',                    'zap'),
  ('Conectores',        'BNC, RJ45, P4, RCA e outros',              'plug'),
  ('Antenas',           'Antenas parabólicas e digitais',           'radio'),
  ('LNBF',              'Cabeças receptoras de satélite',           'satellite-dish'),
  ('Interfones',        'Interfones e videoporteiros',              'phone'),
  ('Fechaduras',        'Fechaduras elétricas e eletromagnéticas',  'lock'),
  ('Motores',           'Motores para portão deslizante e basculante','settings'),
  ('Sensores',          'Sensores de movimento, abertura, fumaça',  'activity'),
  ('Redes',             'Switches, roteadores, patch panels',       'wifi'),
  ('Controle de Acesso','Catracas, leitores biométricos, tags',     'shield'),
  ('Ferramentas',       'Ferramentas e equipamentos de instalação', 'wrench'),
  ('Acessórios',        'Suportes, parafusos, caixas de passagem',  'box')
ON CONFLICT (nome) DO NOTHING;

-- ============================================================
-- DADOS INICIAIS - Produtos de exemplo
-- ============================================================
INSERT INTO public.produtos (nome, categoria_id, marca, modelo, quantidade, estoque_minimo, unidade) VALUES
  ('Câmera Dome 1080p', (SELECT id FROM categorias WHERE nome='Câmeras'), 'Marca Exemplo', 'CAM-01', 10, 3, 'un'),
  ('Cabo de Rede Cat6', (SELECT id FROM categorias WHERE nome='Cabos'), 'Marca Exemplo', 'CAT6-305', 150, 50, 'm'),
  ('Fonte 12V 5A', (SELECT id FROM categorias WHERE nome='Fontes'), 'Marca Exemplo', 'FT-125', 10, 4, 'un'),
  ('Conector RJ45', (SELECT id FROM categorias WHERE nome='Conectores'), 'Marca Exemplo', 'RJ45', 200, 50, 'un'),
  ('Parafuso 5 mm', (SELECT id FROM categorias WHERE nome='Acessórios'), 'Marca Exemplo', 'PF-05', 500, 100, 'un')
ON CONFLICT DO NOTHING;

-- ============================================================
-- DADOS INICIAIS - Kits
-- ============================================================
INSERT INTO public.kits (nome, descricao) VALUES
  ('Kit Câmera Básico', '1 câmera dome + fonte + cabos + conectores'),
  ('Kit CFTV 4 Câmeras', '4 câmeras + DVR 4ch + fonte + cabos 20m'),
  ('Kit Antena Parabólica', 'Antena + LNBF + cabo 10m + conectores'),
  ('Kit Interfone', 'Interfone + fechadura + fonte'),
  ('Kit Motor Deslizante', 'Motor 1/4 + controles + sensor')
ON CONFLICT DO NOTHING;

-- Nota: itens dos kits devem ser inseridos após ter os IDs dos produtos
-- Use a tela de administração para configurar os itens de cada kit

-- ============================================================
-- REALTIME - habilitar para tabelas críticas
-- ============================================================
-- Execute no dashboard Supabase > Database > Replication
-- ALTER PUBLICATION supabase_realtime ADD TABLE produtos;
-- ALTER PUBLICATION supabase_realtime ADD TABLE movimentacoes;
-- ALTER PUBLICATION supabase_realtime ADD TABLE orcamentos;
-- ALTER PUBLICATION supabase_realtime ADD TABLE orcamento_itens;

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
