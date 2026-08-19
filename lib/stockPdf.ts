import { jsPDF } from 'jspdf'
import type { ProdutoComStatus } from '../types'

const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const MARGIN = 15
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BLOOD_RED: [number, number, number] = [126, 18, 24]
const DARK: [number, number, number] = [20, 22, 27]
const MUTED: [number, number, number] = [92, 99, 112]
const LIGHT: [number, number, number] = [244, 245, 247]

type StockPdfOptions = {
  generatedAt?: Date
  generatedBy?: string
}

function quantity(value: number, unit: string) {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${unit}`
}

function statusLabel(product: ProdutoComStatus) {
  if (product.status_estoque === 'zerado') return 'Zerado'
  if (product.status_estoque === 'baixo') return 'Baixo'
  return 'Normal'
}

function dateTimeLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
  }).format(date)
}

function drawHeader(doc: jsPDF, generatedAt: Date) {
  doc.setFillColor(...DARK)
  doc.rect(0, 0, PAGE_WIDTH, 32, 'F')
  doc.setFillColor(...BLOOD_RED)
  doc.rect(0, 0, 7, 32, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('SenaGest', MARGIN, 13)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(205, 209, 217)
  doc.text('RELATORIO DE ESTOQUE ATUAL', MARGIN, 20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(dateTimeLabel(generatedAt), PAGE_WIDTH - MARGIN, 16, { align: 'right' })
}

function drawSummary(doc: jsPDF, products: ProdutoComStatus[], generatedBy?: string) {
  const cards = [
    { label: 'Produtos ativos', value: products.length, color: DARK },
    { label: 'Estoque baixo', value: products.filter(product => product.status_estoque === 'baixo').length, color: [180, 83, 9] as [number, number, number] },
    { label: 'Sem estoque', value: products.filter(product => product.status_estoque === 'zerado').length, color: BLOOD_RED },
  ]
  const gap = 5
  const width = (CONTENT_WIDTH - gap * 2) / 3

  cards.forEach((card, index) => {
    const x = MARGIN + index * (width + gap)
    doc.setFillColor(...LIGHT)
    doc.roundedRect(x, 41, width, 22, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...card.color)
    doc.text(String(card.value), x + 5, 51)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(card.label.toUpperCase(), x + 5, 58)
  })

  if (generatedBy) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(`Gerado por: ${generatedBy}`, MARGIN, 69)
  }
}

const columns = [68, 37, 27, 27, 21]

function drawTableHeader(doc: jsPDF, y: number) {
  const labels = ['Produto', 'Categoria', 'Disponivel', 'Minimo', 'Situacao']
  let x = MARGIN
  doc.setFillColor(...BLOOD_RED)
  doc.rect(MARGIN, y, CONTENT_WIDTH, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  labels.forEach((label, index) => {
    doc.text(label, x + 3, y + 6.4)
    x += columns[index]
  })
  return y + 10
}

function addTablePage(doc: jsPDF, generatedAt: Date) {
  doc.addPage()
  drawHeader(doc, generatedAt)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text('LISTA DE PRODUTOS - CONTINUACAO', MARGIN, 43)
  return drawTableHeader(doc, 48)
}

function drawProducts(doc: jsPDF, products: ProdutoComStatus[], generatedAt: Date, startY: number) {
  let y = drawTableHeader(doc, startY)
  products.forEach((product, index) => {
    const productName = [product.nome, product.marca, product.modelo].filter(Boolean).join(' - ')
    const nameLines = doc.splitTextToSize(productName, columns[0] - 6)
    const categoryLines = doc.splitTextToSize(product.categoria?.nome || 'Sem categoria', columns[1] - 6)
    const rowHeight = Math.max(10, Math.max(nameLines.length, categoryLines.length) * 3.7 + 5)

    if (y + rowHeight > PAGE_HEIGHT - 18) y = addTablePage(doc, generatedAt)

    doc.setFillColor(...(index % 2 === 0 ? LIGHT : [255, 255, 255] as [number, number, number]))
    doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, 'F')
    doc.setDrawColor(220, 223, 229)
    doc.setLineWidth(0.2)
    let x = MARGIN
    columns.forEach(width => {
      doc.rect(x, y, width, rowHeight)
      x += width
    })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...DARK)
    doc.text(nameLines, MARGIN + 3, y + 5)
    doc.text(categoryLines, MARGIN + columns[0] + 3, y + 5)
    doc.text(quantity(product.quantidade, product.unidade), MARGIN + columns[0] + columns[1] + columns[2] - 3, y + 5, { align: 'right' })
    doc.text(quantity(product.estoque_minimo, product.unidade), MARGIN + columns[0] + columns[1] + columns[2] + columns[3] - 3, y + 5, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...(product.status_estoque === 'ok' ? [22, 101, 52] as [number, number, number] : product.status_estoque === 'baixo' ? [180, 83, 9] as [number, number, number] : BLOOD_RED))
    doc.text(statusLabel(product), PAGE_WIDTH - MARGIN - 3, y + 5, { align: 'right' })
    y += rowHeight
  })
}

function addFooters(doc: jsPDF) {
  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(220, 223, 229)
    doc.line(MARGIN, PAGE_HEIGHT - 12, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text('Documento gerado pelo SenaGest', MARGIN, PAGE_HEIGHT - 7)
    doc.text(`Pagina ${page} de ${total}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 7, { align: 'right' })
  }
}

export function generateStockPdf(products: ProdutoComStatus[], options: StockPdfOptions = {}) {
  const generatedAt = options.generatedAt || new Date()
  const sorted = [...products].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  drawHeader(doc, generatedAt)
  drawSummary(doc, sorted, options.generatedBy)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text('LISTA DE PRODUTOS', MARGIN, options.generatedBy ? 79 : 73)
  drawProducts(doc, sorted, generatedAt, options.generatedBy ? 84 : 78)
  addFooters(doc)
  return doc
}

export function generateStockPdfBlob(products: ProdutoComStatus[], options?: StockPdfOptions) {
  return generateStockPdf(products, options).output('blob')
}

export function stockPdfFileName(date = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date)
  return `estoque-atual-${day}.pdf`
}
