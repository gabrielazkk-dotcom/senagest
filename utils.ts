import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  } catch {
    return dateStr
  }
}

export function formatDateShort(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return dateStr
  }
}

export function formatQuantidade(qty: number, unidade: string): string {
  return `${qty} ${unidade}`
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pendente: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    aprovado: 'bg-green-500/10 text-green-400 border-green-500/20',
    recusado: 'bg-red-500/10 text-red-400 border-red-500/20',
    em_execucao: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    finalizado: 'bg-surface-500/10 text-surface-400 border-surface-500/20',
    ok: 'bg-green-500/10 text-green-400',
    baixo: 'bg-yellow-500/10 text-yellow-400',
    zerado: 'bg-red-500/10 text-red-400',
  }
  return colors[status] || 'bg-surface-700 text-surface-300'
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pendente: 'Pendente',
    aprovado: 'Aprovado',
    recusado: 'Recusado',
    em_execucao: 'Em Execução',
    finalizado: 'Finalizado',
    entrada: 'Entrada',
    saida: 'Saída',
    ajuste: 'Ajuste',
  }
  return labels[status] || status
}

export function getEstoqueStatus(produto: { quantidade: number; estoque_minimo: number }) {
  if (produto.quantidade <= 0) return 'zerado'
  if (produto.quantidade <= produto.estoque_minimo) return 'baixo'
  return 'ok'
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function generateOrcamentoNumber(numero: number): string {
  return `ORC-${String(numero).padStart(4, '0')}`
}