import type { Orcamento } from './types'
import { formatCurrency, formatDateShort, generateOrcamentoNumber } from './utils'

export async function gerarPdfOrcamento(orcamento: Orcamento): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()
  const primary = [185, 28, 28] as [number, number, number]
  const dark = [24, 24, 27] as [number, number, number]

  doc.setFillColor(...dark)
  doc.rect(0, 0, width, 42, 'F')
  doc.setFillColor(...primary)
  doc.rect(0, 42, width, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('SenaGest', 14, 18)
  doc.setFontSize(10)
  doc.text('ORÇAMENTO', 14, 29)
  doc.setFontSize(14)
  doc.text(generateOrcamentoNumber(orcamento.numero), width - 14, 18, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Emitido em ${formatDateShort(orcamento.created_at)}`, width - 14, 27, { align: 'right' })

  doc.setTextColor(...dark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('CLIENTE', 14, 56)
  doc.setFontSize(12)
  doc.text(orcamento.cliente_nome, 14, 64)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const contact = [orcamento.cliente_telefone, orcamento.cliente_endereco].filter(Boolean).join(' | ')
  if (contact) doc.text(contact, 14, 70)

  doc.setFont('helvetica', 'bold')
  doc.text('DESCRIÇÃO', 14, 82)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(orcamento.descricao, 14, 89, { maxWidth: width - 28 })

  autoTable(doc, {
    startY: 101,
    head: [['#', 'Item', 'Qtd.', 'Valor unitário', 'Desconto', 'Total']],
    body: (orcamento.itens || []).map((item, index) => [
      String(index + 1),
      item.nome,
      String(item.quantidade),
      formatCurrency(item.valor_unitario),
      item.desconto > 0 ? `${item.desconto}%` : '-',
      formatCurrency(item.total),
    ]),
    theme: 'grid',
    headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 28, halign: 'right' },
    },
  })

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  const totalX = width - 75
  doc.setFontSize(9)
  doc.setTextColor(82, 82, 91)
  doc.text('Subtotal:', totalX, finalY)
  doc.text(formatCurrency(orcamento.subtotal), width - 14, finalY, { align: 'right' })
  doc.text('Mão de obra:', totalX, finalY + 7)
  doc.text(formatCurrency(orcamento.mao_de_obra), width - 14, finalY + 7, { align: 'right' })
  doc.setFillColor(...primary)
  doc.roundedRect(totalX - 4, finalY + 12, width - totalX - 10, 12, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text('TOTAL', totalX, finalY + 20)
  doc.text(formatCurrency(orcamento.total), width - 14, finalY + 20, { align: 'right' })

  if (orcamento.observacoes) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(82, 82, 91)
    doc.setFontSize(8)
    doc.text(`Observações: ${orcamento.observacoes}`, 14, finalY + 36, { maxWidth: width - 28 })
  }

  doc.setFont('helvetica', 'italic')
  doc.setTextColor(113, 113, 122)
  doc.setFontSize(7)
  doc.text('Documento demonstrativo gerado pelo SenaGest.', width / 2, 288, { align: 'center' })
  doc.save(`orcamento-${generateOrcamentoNumber(orcamento.numero)}.pdf`)
}

export function compartilharWhatsApp(orcamento: Orcamento): void {
  const texto = [
    `Olá, ${orcamento.cliente_nome}!`,
    '',
    `Segue o orçamento ${generateOrcamentoNumber(orcamento.numero)}.`,
    orcamento.descricao,
    `Total: ${formatCurrency(orcamento.total)}`,
  ].join('\n')
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
}
