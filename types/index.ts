// ============================================================
// TECGEST - Tipos TypeScript
// ============================================================

export type UserRole = 'tecnico' | 'admin'

export interface Profile {
  id: string
  nome: string
  email: string
  role: UserRole
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface Categoria {
  id: string
  nome: string
  descricao?: string
  icone?: string
  created_at: string
}

export type UnidadeMedida = 'un' | 'pç' | 'm' | 'cx' | 'rolo' | 'par' | 'kit'

export interface Produto {
  id: string
  nome: string
  categoria_id?: string
  categoria?: Categoria
  marca?: string
  modelo?: string
  descricao?: string
  preco?: number
  quantidade: number
  estoque_minimo: number
  unidade: UnidadeMedida
  observacoes?: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface ProdutoComStatus extends Produto {
  status_estoque: 'ok' | 'baixo' | 'zerado'
}

export interface Cliente {
  id: string
  nome: string
  cpf?: string
  telefone?: string
  email?: string
  endereco?: string
  cidade?: string
  observacoes?: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export type TipoMovimentacao = 'entrada' | 'saida' | 'ajuste'

export interface Movimentacao {
  id: string
  produto_id: string
  produto?: Produto
  cliente_id?: string
  cliente?: Cliente
  tecnico_id: string
  tecnico?: Profile
  tipo: TipoMovimentacao
  quantidade: number
  observacao?: string
  referencia?: string
  created_at: string
}

export type StatusOrcamento = 'pendente' | 'aprovado' | 'recusado' | 'em_execucao' | 'finalizado'

export interface OrcamentoItem {
  id: string
  orcamento_id: string
  produto_id?: string
  produto?: Produto
  nome: string
  quantidade: number
  valor_unitario: number
  desconto: number
  total: number
  created_at: string
}

export interface Orcamento {
  id: string
  numero: number
  cliente_id?: string
  cliente?: Cliente
  cliente_nome: string
  cliente_telefone?: string
  cliente_endereco?: string
  descricao: string
  validade?: string
  status: StatusOrcamento
  subtotal: number
  desconto: number
  mao_de_obra: number
  total: number
  observacoes?: string
  foto_url?: string           // ← CAMPO NOVO
  tecnico_id: string
  tecnico?: Profile
  itens?: OrcamentoItem[]
  aprovado_em?: string
  finalizado_em?: string
  created_at: string
  updated_at: string
}

export interface Kit {
  id: string
  nome: string
  descricao?: string
  ativo: boolean
  itens?: KitItem[]
  created_at: string
}

export interface KitItem {
  id: string
  kit_id: string
  produto_id: string
  produto?: Produto
  quantidade: number
  created_at: string
}

// ============================================================
// DTOs para formulários
// ============================================================

export interface CreateProdutoDto {
  nome: string
  categoria_id?: string
  marca?: string
  modelo?: string
  descricao?: string
  preco?: number
  quantidade: number
  estoque_minimo: number
  unidade: UnidadeMedida
  observacoes?: string
}

export interface ClientLogin {
  id: string
  cliente_id: string
  cliente?: Pick<Cliente, 'id' | 'nome'>
  empresa?: string
  marca?: CredentialBrand
  tipo_acesso: string
  sistema_equipamento: string
  url_ip?: string
  usuario: string
  senha: string
  observacoes?: string
  created_at: string
  updated_at: string
}

export type CredentialBrand = 'generico'

export type TimeEntryType = 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida'

export interface TimeEntry {
  id: string
  user_id: string
  user?: Pick<Profile, 'id' | 'nome'>
  entry_type: TimeEntryType
  occurred_at: string
  work_date: string
  latitude: number
  longitude: number
  accuracy: number
  address?: string
}

export interface SavedLocation {
  id: string
  nome: string
  cliente_id?: string
  cliente?: Pick<Cliente, 'id' | 'nome'>
  endereco?: string
  referencia?: string
  latitude: number
  longitude: number
  precisao?: number
  criado_por: string
  criador?: Pick<Profile, 'id' | 'nome'>
  created_at: string
  updated_at: string
}

export interface CreateSavedLocationDto {
  nome: string
  cliente_id?: string
  endereco?: string
  referencia?: string
  latitude: number
  longitude: number
  precisao?: number
}

export interface CreateMovimentacaoDto {
  produto_id: string
  cliente_id?: string
  tipo: TipoMovimentacao
  quantidade: number
  observacao?: string
  referencia?: string
}

export interface CreateClienteDto {
  nome: string
  cpf?: string
  telefone?: string
  email?: string
  endereco?: string
  cidade?: string
  observacoes?: string
}

export interface OrcamentoItemForm {
  produto_id?: string
  nome: string
  quantidade: number
  valor_unitario: number
  desconto: number
}

export interface CreateOrcamentoDto {
  cliente_id?: string
  cliente_nome: string
  cliente_telefone?: string
  cliente_endereco?: string
  descricao: string
  validade?: string
  mao_de_obra: number
  desconto: number
  observacoes?: string
  itens: OrcamentoItemForm[]
}

// ============================================================
// Dashboard
// ============================================================

export interface DashboardStats {
  total_produtos: number
  produtos_zerados: number
  produtos_baixo_estoque: number
  total_orcamentos: number
  orcamentos_pendentes: number
  orcamentos_aprovados: number
  valor_orcamentos_aberto: number
  ultimas_movimentacoes: Movimentacao[]
  produtos_mais_usados: Array<{ produto: string; total: number }>
}

export interface ProductUsageRow {
  produto_id: string
  nome: string
  unidade: string
  categoria_id?: string
  categoria?: string
  quantidade_atual: number
  estoque_minimo: number
  total_utilizado: number
  registros: number
  servicos: number
  clientes: number
  ultimo_uso?: string
}

export interface ProductUsageDashboard {
  resumo: {
    produtos: number
    registros: number
    servicos: number
    clientes: number
  }
  produtos: ProductUsageRow[]
}
