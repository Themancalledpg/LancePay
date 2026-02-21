import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Shared validation schema for credit advance amount inputs.
 *
 * Fix for #169 [BUG] Credit Advance: Missing Positive Amount Validation
 * -----------------------------------------------------------------------
 * The `requestedAmountUSDC` field now enforces:
 *   - `.positive()` — rejects zero and negative values at the API layer
 *   - `.max(50000)` — existing upper bound is preserved
 *
 * This prevents logically invalid advance requests (e.g. $0 or -$100)
 * from ever reaching the database or downstream ledger.
 */
export const CreditAmountSchema = z.object({
  requestedAmountUSDC: z
    .number({
      required_error: 'Amount is required',
      invalid_type_error: 'Amount must be a number',
    })
    .positive('Amount must be greater than zero')
    .max(50000, 'Amount cannot exceed $50,000 USDC'),
})

export type CreditAmountInput = z.infer<typeof CreditAmountSchema>

/**
 * POST /api/routes-d/credit/validate
 * Validates a credit advance amount before submission.
 *
 * This is a lightweight pre-flight endpoint clients can call to get
 * clear validation feedback before hitting the full advance endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = CreditAmountSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        {
          valid: false,
          errors: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        valid: true,
        amount: result.data.requestedAmountUSDC,
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json(
      { error: 'Failed to validate advance amount' },
      { status: 500 }
    )
  }
}
