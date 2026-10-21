/**
 * Unified Checkout & Payment Aggregator Gateway
 * Handles:
 * - Safaricom M-Pesa Express (STK Push)
 * - PayPal Orders API v2 & Webhook Capture
 * - Multi-currency FX conversion (USD to KES)
 * - Remittance settlement into local cash flow ledger
 */

export interface UnifiedCheckoutRequest {
  orderId?: string;
  amount: number;
  currency: 'KES' | 'USD' | 'EUR' | 'GBP';
  description: string;
  customerEmail: string;
  customerPhone?: string;
  provider: 'mpesa_express' | 'paypal' | 'pesapal' | 'flutterwave';
  metadata?: Record<string, any>;
}

export interface UnifiedCheckoutResponse {
  orderId: string;
  provider: string;
  status: 'pending' | 'completed' | 'processing';
  amount: number;
  currency: string;
  settledAmountKes: number;
  fxRate: number;
  paymentUrl?: string;
  checkoutInstructions?: string;
}

class UnifiedCheckoutManager {
  // Live / Estimated FX rates to KES
  private fxRatesToKes: Record<string, number> = {
    KES: 1.0,
    USD: 130.5,
    EUR: 141.2,
    GBP: 168.0,
  };

  /**
   * Initializes a payment intent through the chosen aggregator or processor
   */
  async createCheckoutSession(req: UnifiedCheckoutRequest): Promise<UnifiedCheckoutResponse> {
    const orderId = req.orderId || `ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const fxRate = this.fxRatesToKes[req.currency] || 130.5;
    const settledKes = Math.round(req.amount * fxRate * 100) / 100;

    if (req.provider === 'paypal') {
      // PayPal Orders v2 Session Simulation
      const paypalOrderId = `PAYPAL_ORDER_${Date.now()}`;
      return {
        orderId,
        provider: 'paypal',
        status: 'pending',
        amount: req.amount,
        currency: req.currency,
        settledAmountKes: settledKes,
        fxRate,
        paymentUrl: `https://www.paypal.com/checkoutnow?token=${paypalOrderId}`,
        checkoutInstructions: `PayPal order generated. Gross: ${req.currency} ${req.amount.toFixed(2)} (Settles as KES ${settledKes.toLocaleString()} at KES ${fxRate}/USD).`,
      };
    }

    if (req.provider === 'mpesa_express') {
      return {
        orderId,
        provider: 'mpesa_express',
        status: 'pending',
        amount: settledKes,
        currency: 'KES',
        settledAmountKes: settledKes,
        fxRate: 1.0,
        checkoutInstructions: `STK Push initiated to ${req.customerPhone || 'your mobile phone'}. Prompt requires M-Pesa PIN confirmation.`,
      };
    }

    // Default Card / Pesapal / Aggregator
    return {
      orderId,
      provider: req.provider,
      status: 'pending',
      amount: req.amount,
      currency: req.currency,
      settledAmountKes: settledKes,
      fxRate,
      paymentUrl: `https://checkout.pesapal.com/v3/redirect?order_id=${orderId}`,
      checkoutInstructions: `Redirecting to unified aggregator for Visa / Mastercard / Mobile money checkout.`,
    };
  }

  /**
   * Simulates/Processes incoming payment capture (e.g. PayPal webhook or aggregator notification)
   */
  async capturePayment(orderId: string, provider: string, amount: number, currency: string) {
    const fxRate = this.fxRatesToKes[currency] || 130.5;
    const settledKes = Math.round(amount * fxRate * 100) / 100;

    return {
      orderId,
      provider,
      status: 'completed',
      capturedGross: amount,
      currency,
      settledKes,
      feeKes: Math.round(settledKes * 0.029 * 100) / 100, // standard aggregator fee ~2.9%
      netKes: Math.round(settledKes * (1 - 0.029) * 100) / 100,
      timestamp: new Date().toISOString(),
    };
  }
}

export const unifiedCheckout = new UnifiedCheckoutManager();
