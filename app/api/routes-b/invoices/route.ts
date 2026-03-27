import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { generateInvoiceNumber } from '@/lib/utils'

async function getUniqueInvoiceNumber() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = generateInvoiceNumber()
    const existingInvoice = await prisma.invoice.findUnique({
      where: { invoiceNumber },
      select: { id: true },
    })

    if (!existingInvoice) {
      return invoiceNumber
    }
  }

  throw new Error('Failed to generate a unique invoice number')
}

export async function POST(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const body = await request.json()
  const { clientEmail, clientName, description, amount, currency = 'USD', dueDate } = body

  if (!clientEmail || !description || amount === undefined || amount === null) {
    return NextResponse.json(
      { error: 'clientEmail, description, and amount are required' },
      { status: 400 },
    )
  }

  const parsedAmount = Number(amount)
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'amount must be greater than 0' }, { status: 400 })
  }

  let parsedDueDate: Date | null = null
  if (dueDate) {
    parsedDueDate = new Date(dueDate)
    if (Number.isNaN(parsedDueDate.getTime())) {
      return NextResponse.json({ error: 'dueDate must be a valid date string' }, { status: 400 })
    }
  }

  const invoiceNumber = await getUniqueInvoiceNumber()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`
  const paymentLink = `${baseUrl}/pay/${invoiceNumber}`

  const invoice = await prisma.invoice.create({
    data: {
      userId: user.id,
      invoiceNumber,
      clientEmail: String(clientEmail).toLowerCase(),
      clientName: clientName || null,
      description,
      amount: parsedAmount,
      currency,
      paymentLink,
      dueDate: parsedDueDate,
    },
  })

  return NextResponse.json(
    {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentLink: invoice.paymentLink,
      status: invoice.status,
      amount: Number(invoice.amount),
      currency: invoice.currency,
    },
    { status: 201 },
  )
}
