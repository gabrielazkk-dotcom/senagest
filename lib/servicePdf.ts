import { jsPDF } from 'jspdf'
import type { ServicoResumo } from '../services/servico'

type LoadedImage = { dataUrl: string; format: 'JPEG' | 'PNG' | 'WEBP' }
type PdfOptions = { loadImage?: (url: string) => Promise<LoadedImage> }

const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const MARGIN = 15
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BLOOD_RED: [number, number, number] = [126, 18, 24]
const DARK: [number, number, number] = [20, 22, 27]
const MUTED: [number, number, number] = [92, 99, 112]
const LIGHT: [number, number, number] = [244, 245, 247]

function cleanText(value?: string | null) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function fileSafe(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

function statusLabel(status: string) {
  if (status === 'finalizado') return 'Finalizado'
  if (status === 'em_andamento') return 'Em andamento'
  return status
}

function dateLabel(value?: string | null) {
  if (!value) return 'Nao informado'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function drawHeader(doc: jsPDF, service: ServicoResumo) {
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
  doc.text('RELATORIO TECNICO DE SERVICO', MARGIN, 20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(`#${service.id.slice(0, 8).toUpperCase()}`, PAGE_WIDTH - MARGIN, 13, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(205, 209, 217)
  doc.text(statusLabel(service.status).toUpperCase(), PAGE_WIDTH - MARGIN, 20, { align: 'right' })
}

function addPage(doc: jsPDF, service: ServicoResumo) {
  doc.addPage()
  drawHeader(doc, service)
  return 42
}

function ensureSpace(doc: jsPDF, service: ServicoResumo, y: number, needed: number) {
  return y + needed > PAGE_HEIGHT - 18 ? addPage(doc, service) : y
}

function sectionTitle(doc: jsPDF, title: string, y: number) {
  doc.setFillColor(...BLOOD_RED)
  doc.roundedRect(MARGIN, y, 3, 6, 1, 1, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text(title.toUpperCase(), MARGIN + 7, y + 5)
  return y + 11
}

function infoCard(doc: jsPDF, label: string, value: string, x: number, y: number, width: number) {
  doc.setFillColor(...LIGHT)
  doc.roundedRect(x, y, width, 16, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...MUTED)
  doc.text(label.toUpperCase(), x + 4, y + 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  const line = doc.splitTextToSize(value || 'Nao informado', width - 8)[0]
  doc.text(line, x + 4, y + 11)
}

function textBlock(doc: jsPDF, label: string, value: string, y: number) {
  const content = value || 'Nao informado'
  const lines = doc.splitTextToSize(content, CONTENT_WIDTH - 10)
  const height = Math.max(17, lines.length * 4.2 + 11)
  doc.setFillColor(...LIGHT)
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...MUTED)
  doc.text(label.toUpperCase(), MARGIN + 5, y + 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text(lines, MARGIN + 5, y + 11)
  return y + height + 4
}

function tableHeader(doc: jsPDF, y: number) {
  const widths = [85, 32, 63]
  const labels = ['Produto', 'Quantidade', 'Observacao']
  let x = MARGIN
  doc.setFillColor(...BLOOD_RED)
  doc.rect(MARGIN, y, CONTENT_WIDTH, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  labels.forEach((label, index) => {
    doc.text(label, x + 3, y + 6.4)
    x += widths[index]
  })
  return y + 10
}

function drawProductsTable(doc: jsPDF, service: ServicoResumo, startY: number) {
  const widths = [85, 32, 63]
  let y = tableHeader(doc, startY)

  service.itens.forEach((item, index) => {
    const productLines = doc.splitTextToSize(item.produto_nome, widths[0] - 6)
    const observationLines = doc.splitTextToSize(cleanText(item.observacao) || '-', widths[2] - 6)
    const rowHeight = Math.max(9, Math.max(productLines.length, observationLines.length) * 3.8 + 5)

    if (y + rowHeight > PAGE_HEIGHT - 18) {
      y = addPage(doc, service)
      y = sectionTitle(doc, 'Produtos utilizados - continuacao', y)
      y = tableHeader(doc, y)
    }

    doc.setFillColor(...(index % 2 === 0 ? LIGHT : [255, 255, 255] as [number, number, number]))
    doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, 'F')
    doc.setDrawColor(220, 223, 229)
    doc.setLineWidth(0.2)
    let x = MARGIN
    widths.forEach(width => {
      doc.rect(x, y, width, rowHeight)
      x += width
    })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK)
    doc.text(productLines, MARGIN + 3, y + 5)
    doc.text(`${item.quantidade} ${item.unidade}`, MARGIN + widths[0] + widths[1] - 3, y + 5, { align: 'right' })
    doc.text(observationLines, MARGIN + widths[0] + widths[1] + 3, y + 5)
    y += rowHeight
  })

  return y
}

async function browserLoadImage(url: string): Promise<LoadedImage> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Imagem indisponivel (${response.status})`)
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Falha ao decodificar imagem'))
      element.src = objectUrl
    })

    // Fotos de celulares chegam facilmente a 5-10 MB. Inserir os arquivos
    // originais no jsPDF esgota a memoria do navegador depois de poucas fotos.
    // Redimensionar para 1400 px preserva nitidez no A4 e reduz drasticamente
    // o consumo de memoria e o tamanho do documento.
    const maxDimension = 1400
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('O navegador nao conseguiu preparar a foto')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    return { dataUrl: canvas.toDataURL('image/jpeg', 0.8), format: 'JPEG' }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function drawPhotos(doc: jsPDF, service: ServicoResumo, startY: number, loader: (url: string) => Promise<LoadedImage>) {
  let y = startY
  const boxWidth = 86
  const boxHeight = 58
  const gap = 8
  let column = 0

  for (let index = 0; index < service.fotos_urls.length; index += 1) {
    if (column === 0) y = ensureSpace(doc, service, y, boxHeight + 9)
    const x = MARGIN + column * (boxWidth + gap)
    doc.setFillColor(235, 237, 241)
    doc.roundedRect(x, y, boxWidth, boxHeight, 2, 2, 'F')
    try {
      const image = await loader(service.fotos_urls[index])
      const properties = doc.getImageProperties(image.dataUrl)
      const scale = Math.min((boxWidth - 4) / properties.width, (boxHeight - 8) / properties.height)
      const width = properties.width * scale
      const height = properties.height * scale
      doc.addImage(image.dataUrl, image.format, x + (boxWidth - width) / 2, y + 2 + (boxHeight - 8 - height) / 2, width, height, undefined, 'FAST')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...MUTED)
      doc.text(`Foto ${index + 1}`, x + boxWidth / 2, y + boxHeight - 2, { align: 'center' })
    } catch {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...MUTED)
      doc.text(`Foto ${index + 1} indisponivel`, x + boxWidth / 2, y + boxHeight / 2, { align: 'center' })
    }

    column += 1
    if (column === 2 || index === service.fotos_urls.length - 1) {
      column = 0
      y += boxHeight + gap
    }
  }
  return y
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

export async function generateServicePdf(service: ServicoResumo, options: PdfOptions = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const loader = options.loadImage || browserLoadImage
  drawHeader(doc, service)
  let y = 42

  y = sectionTitle(doc, 'Identificacao', y)
  infoCard(doc, 'Cliente', service.cliente?.nome || 'Nao informado', MARGIN, y, 87)
  infoCard(doc, 'Tecnico responsavel', service.tecnico?.nome || 'Nao informado', MARGIN + 93, y, 87)
  y += 20
  if (service.cliente?.telefone || service.cliente?.email || service.cliente?.cpf) {
    infoCard(doc, 'Telefone', service.cliente?.telefone || 'Nao informado', MARGIN, y, 55)
    infoCard(doc, 'E-mail', service.cliente?.email || 'Nao informado', MARGIN + 62, y, 55)
    infoCard(doc, 'CPF', service.cliente?.cpf || 'Nao informado', MARGIN + 124, y, 56)
    y += 20
  }
  if (service.cliente?.endereco || service.cliente?.cidade) {
    y = textBlock(doc, 'Endereco do cliente', [service.cliente.endereco, service.cliente.cidade].filter(Boolean).join(' - '), y)
  }
  y = ensureSpace(doc, service, y, 20)
  infoCard(doc, 'Criado em', dateLabel(service.created_at), MARGIN, y, 55)
  infoCard(doc, 'Iniciado em', dateLabel(service.iniciado_em), MARGIN + 62, y, 55)
  infoCard(doc, service.status === 'finalizado' ? 'Finalizado em' : 'Status', service.status === 'finalizado' ? dateLabel(service.finalizado_em) : statusLabel(service.status), MARGIN + 124, y, 56)
  y += 23

  y = ensureSpace(doc, service, y, 35)
  y = sectionTitle(doc, 'Detalhes do servico', y)
  y = textBlock(doc, 'Descricao', cleanText(service.descricao), y)
  if (service.observacoes) y = textBlock(doc, 'Observacoes', cleanText(service.observacoes), y)

  y = ensureSpace(doc, service, y, 35)
  y = sectionTitle(doc, 'Produtos utilizados', y)
  y = drawProductsTable(doc, service, y) + 9

  if (service.fotos_urls.length > 0) {
    y = ensureSpace(doc, service, y, 25)
    y = sectionTitle(doc, `Registro fotografico (${service.fotos_urls.length})`, y)
    y = await drawPhotos(doc, service, y, loader)
  }

  if (service.videos_urls.length > 0) {
    y = ensureSpace(doc, service, y, 20 + service.videos_urls.length * 8)
    y = sectionTitle(doc, `Videos anexados (${service.videos_urls.length})`, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    service.videos_urls.forEach((url, index) => {
      y = ensureSpace(doc, service, y, 9)
      doc.setTextColor(...BLOOD_RED)
      doc.textWithLink(`Abrir video ${index + 1}`, MARGIN + 2, y, { url })
      y += 8
    })
  }

  addFooters(doc)
  return doc
}

export async function generateServicePdfBlob(service: ServicoResumo, options?: PdfOptions) {
  return (await generateServicePdf(service, options)).output('blob')
}

export function servicePdfFileName(service: ServicoResumo) {
  const client = fileSafe(service.cliente?.nome || 'cliente') || 'cliente'
  return `servico-${client}-${service.id.slice(0, 8)}.pdf`
}
