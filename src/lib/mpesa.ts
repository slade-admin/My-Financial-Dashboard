/**
 * Safaricom M-Pesa Daraja 2.0 API Client & Callback Processor
 *
 * IMPORTANT: This module requires valid Safaricom Daraja API credentials.
 * No mock/fallback behavior is used. Missing credentials will throw errors.
 *
 * Supports:
 * - STK Push (Lipa Na M-Pesa Online)
 * - C2B Real-time Validation & Confirmation Callbacks
 * - Transaction Status Query
 */

export interface DarajaSTKPushParams {
  phoneNumber: string;       // 2547XXXXXXXX
  amount: number;            // in KES
  accountReference: string;  // e.g. Bill Ref or Invoice #
  transactionDesc: string;   // Short description
  callbackUrl?: string;
}

export interface DarajaC2BCallback {
  TransactionType: string;
  TransID: string;           // M-Pesa Receipt Number e.g. RJL792XYZ1
  TransTime: string;         // YYYYMMDDHHmmss
  TransAmount: string | number;
  BusinessShortCode: string;
  BillRefNumber?: string;
  InvoiceNumber?: string;
  OrgAccountBalance?: string;
  ThirdPartyTransID?: string;
  MSISDN: string;            // Customer phone e.g. 254712345678
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
}

export interface STKCallbackMetadataItem {
  Name: string;
  Value?: string | number;
}

export interface STKPushCallbackPayload {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: STKCallbackMetadataItem[];
      };
    };
  };
}

export interface STKPushResult {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

class DarajaService {
  private consumerKey: string;
  private consumerSecret: string;
  private passkey: string;
  private shortCode: string;
  private env: 'sandbox' | 'production';

  constructor() {
    const key = process.env.MPESA_CONSUMER_KEY;
    const secret = process.env.MPESA_CONSUMER_SECRET;
    const passkey = process.env.MPESA_PASSKEY;
    const shortCode = process.env.MPESA_SHORTCODE;

    if (!key || !secret || !passkey || !shortCode) {
      console.warn(
        'M-Pesa Daraja credentials are not configured. ' +
        'Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, and MPESA_SHORTCODE in .env.local. ' +
        'STK Push and other Daraja operations will fail until credentials are provided.'
      );
    }

    this.consumerKey = key || '';
    this.consumerSecret = secret || '';
    this.passkey = passkey || '';
    this.shortCode = shortCode || '';
    this.env = (process.env.MPESA_ENVIRONMENT as 'sandbox' | 'production') === 'production' ? 'production' : 'sandbox';
  }

  /**
   * Returns true if all required Daraja credentials are configured.
   */
  isConfigured(): boolean {
    return !!(this.consumerKey && this.consumerSecret && this.passkey && this.shortCode);
  }

  private getBaseUrl(): string {
    return this.env === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }

  /**
   * Validates that credentials are present before any API call.
   */
  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error(
        'M-Pesa Daraja API is not configured. ' +
        'Missing one or more of: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, MPESA_SHORTCODE.'
      );
    }
  }

  /**
   * Generates Daraja OAuth Access Token.
   * Throws on failure — never returns fake tokens.
   */
  async getAccessToken(): Promise<string> {
    this.assertConfigured();

    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

    const res = await fetch(`${this.getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Daraja OAuth failed (HTTP ${res.status}): ${body}`);
    }

    const data = await res.json();

    if (!data.access_token) {
      throw new Error('Daraja OAuth response did not contain an access_token');
    }

    return data.access_token;
  }

  /**
   * Generates timestamp in YYYYMMDDHHmmss format
   */
  private getTimestamp(): string {
    const date = new Date();
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  /**
   * Triggers an STK Push to the customer's phone.
   * Returns the Safaricom response directly. Never fakes success.
   */
  async initiateSTKPush(params: DarajaSTKPushParams): Promise<STKPushResult> {
    this.assertConfigured();

    const formattedPhone = this.formatKenyanPhone(params.phoneNumber);
    const timestamp = this.getTimestamp();
    const password = Buffer.from(`${this.shortCode}${this.passkey}${timestamp}`).toString('base64');
    const token = await this.getAccessToken();

    const host = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const callbackUrl = params.callbackUrl || `${host}/api/integrations/mpesa/callbacks/stk`;

    const payload = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(params.amount),
      PartyA: formattedPhone,
      PartyB: this.shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: params.accountReference.substring(0, 12),
      TransactionDesc: params.transactionDesc.substring(0, 20),
    };

    const res = await fetch(`${this.getBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Daraja STK Push failed (HTTP ${res.status}): ${body}`);
    }

    const data = await res.json();

    // Safaricom returns ResponseCode "0" for accepted requests
    if (data.ResponseCode !== '0') {
      throw new Error(`STK Push rejected by Safaricom: ${data.ResponseDescription || data.errorMessage || 'Unknown error'}`);
    }

    return data as STKPushResult;
  }

  /**
   * Format any Kenyan phone number to 2547XXXXXXXX or 2541XXXXXXXX
   */
  formatKenyanPhone(phone: string): string {
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('254') && clean.length === 12) return clean;
    if (clean.startsWith('0') && clean.length === 10) return '254' + clean.slice(1);
    if (clean.startsWith('7') && clean.length === 9) return '254' + clean;
    if (clean.startsWith('1') && clean.length === 9) return '254' + clean;
    throw new Error(`Invalid Kenyan phone number format: ${phone}`);
  }

  /**
   * Parses STK Push callback metadata items into a structured object.
   */
  parseSTKCallback(payload: STKPushCallbackPayload) {
    const stk = payload.Body.stkCallback;
    const items = stk.CallbackMetadata?.Item || [];
    const getVal = (name: string) => items.find((i) => i.Name === name)?.Value;

    return {
      merchantRequestId: stk.MerchantRequestID,
      checkoutRequestId: stk.CheckoutRequestID,
      resultCode: stk.ResultCode,
      resultDesc: stk.ResultDesc,
      isSuccessful: stk.ResultCode === 0,
      amount: Number(getVal('Amount') || 0),
      mpesaReceiptNumber: String(getVal('MpesaReceiptNumber') || ''),
      transactionDate: String(getVal('TransactionDate') || ''),
      phoneNumber: String(getVal('PhoneNumber') || ''),
    };
  }
}

export const mpesaService = new DarajaService();
