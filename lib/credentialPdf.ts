import { jsPDF } from 'jspdf'
import type { ClientLogin, CredentialBrand } from '../types'

type Color = [number, number, number]

const primary: Color = [185, 28, 28]
const dark: Color = [24, 24, 27]
const muted: Color = [113, 113, 122]

export const credentialBrands: Array<{ value: CredentialBrand; label: string }> = [
  { value: 'generico', label: 'Marca genérica' },
]

export function inferCredentialBrand(..._values: Array<string | null | undefined>): CredentialBrand {
  void _values
  return 'generico'
}

export function brandLabel(_brand?: CredentialBrand) {
  void _brand
  return 'Marca genérica'
}

function safeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'cliente'
}

export function credentialPdfFileName(clientName: string, records: ClientLogin[]) {
  const suffix = records.length === 1
    ? safeFileName(records[0].sistema_equipamento)
    : 'todos-os-acessos'
  return `acessos-${safeFileName(clientName)}-${suffix}.pdf`
}

function drawHeader(doc: jsPDF, clientName: string) {
  const width = doc.internal.pageSize.getWidth()
  doc.setFillColor(...dark)
  doc.rect(0, 0, width, 48, 'F')
  doc.setFillColor(...primary)
  doc.rect(0, 0, 6, 48, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('SENAGEST', 16, 20)
  doc.setFontSize(13)
  doc.text('CREDENCIAIS DE ACESSO', 16, 32)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(212, 212, 216)
  doc.text(`Cliente: ${clientName}`, 16, 40)
}

function drawRecord(doc: jsPDF, record: ClientLogin, index: number, y: number) {
  const width = doc.internal.pageSize.getWidth() - 32
  doc.setFillColor(250, 250, 250)
  doc.setDrawColor(228, 228, 231)
  doc.roundedRect(16, y, width, 66, 4, 4, 'FD')
  doc.setFillColor(...primary)
  doc.circle(27, y + 12, 6, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(String(index + 1), 27, y + 15, { align: 'center' })

  doc.setTextColor(...dark)
  doc.setFontSize(12)
  doc.text(record.sistema_equipamento, 38, y + 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...muted)
  doc.text([record.tipo_acesso, record.empresa].filter(Boolean).join(' | '), 38, y + 18)

  const rows = [
    ['Usuário', record.usuario],
    ['Senha', record.senha],
    ['URL / IP', record.url_ip || '-'],
  ]
  rows.forEach(([label, value], rowIndex) => {
    const rowY = y + 29 + rowIndex * 11
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...muted)
    doc.setFontSize(7)
    doc.text(label.toUpperCase(), 24, rowY)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...dark)
    doc.setFontSize(9)
    doc.text(doc.splitTextToSize(value, width - 48)[0] || '-', 55, rowY)
  })
}

function drawFooter(doc: jsPDF, page: number, total: number) {
  const height = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...muted)
  doc.text('Documento gerado pelo SenaGest. Mantenha estas informações em segurança.', 16, height - 12)
  doc.text(`${page}/${total}`, doc.internal.pageSize.getWidth() - 16, height - 12, { align: 'right' })
}

export function generateCredentialPdf(records: ClientLogin[], clientName: string) {
  if (!records.length) throw new Error('Nenhum acesso selecionado')
  const perPage = 3
  const pages = Math.ceil(records.length / perPage)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })

  for (let page = 0; page < pages; page += 1) {
    if (page > 0) doc.addPage()
    drawHeader(doc, clientName)
    records.slice(page * perPage, (page + 1) * perPage).forEach((record, index) => {
      drawRecord(doc, record, page * perPage + index, 58 + index * 72)
    })
    drawFooter(doc, page + 1, pages)
  }

  return doc
}

export function generateCredentialPdfBlob(records: ClientLogin[], clientName: string) {
  return generateCredentialPdf(records, clientName).output('blob')
}
