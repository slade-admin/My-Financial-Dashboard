import { NextResponse } from 'next/server';
import { recordMpesaCallback } from '@/lib/store';

/**
 * POST: Receives STK Push callback from Safaricom.
 * This endpoint is called by Safaricom servers, not by the browser.
 * No GET endpoint — callback data must not be publicly accessible.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('[M-Pesa STK Callback] Received:', JSON.stringify(payload));

    const record = await recordMpesaCallback(payload, 'STK_PUSH_CALLBACK');

    // Safaricom expects this exact response format
    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'Callback received and processed',
    });
  } catch (error: any) {
    console.error('[M-Pesa STK Callback] Error:', error);
    // Still return success to Safaricom to prevent retries on our processing errors
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
  }
}
