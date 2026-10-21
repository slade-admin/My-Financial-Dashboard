# Kenya Financial Dashboard & Ecosystem Setup 🇰🇪

This platform powers personal cash flow, automated accounting, tax compliance, and wealth management natively built for the Kenyan economy.

---

## 🛠️ Environment Variables Configuration (`.env.local`)

Create or update `.env.local` in the project root:

```env
# Application Host
NEXT_PUBLIC_APP_URL=http://localhost:3000

# PostgreSQL Database (Financial Records Persistence)
DATABASE_URL=postgresql://postgres:password@localhost:5432/finance_dashboard

# -------------------------------------------------------------
# 1. Safaricom M-Pesa Daraja 2.0 API (Real-Time Cash Flow)
# Sign up at: https://developer.safaricom.co.ke
# -------------------------------------------------------------
MPESA_ENVIRONMENT=sandbox # 'sandbox' or 'production'
MPESA_CONSUMER_KEY=your_daraja_consumer_key
MPESA_CONSUMER_SECRET=your_daraja_consumer_secret
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_SHORTCODE=174379
MPESA_INITIATOR_NAME=testapi
MPESA_SECURITY_CREDENTIAL=your_security_credential

# -------------------------------------------------------------
# 2. Kenyan Direct Banking Gateways
# -------------------------------------------------------------
# Equity Bank Jenga API v3: https://developer.jengaapi.io
EQUITY_JENGA_API_KEY=your_jenga_api_key
EQUITY_JENGA_MERCHANT_CODE=your_merchant_code
EQUITY_JENGA_PRIVATE_KEY=your_private_key_path

# KCB Buni Open Banking: https://buni.kcbgroup.com
KCB_BUNI_CLIENT_ID=your_kcb_client_id
KCB_BUNI_CLIENT_SECRET=your_kcb_client_secret

# Co-operative Bank Open Banking: https://developer.co-opbank.co.ke
COOP_OPENBANKING_CLIENT_ID=your_coop_client_id
COOP_OPENBANKING_CLIENT_SECRET=your_coop_client_secret

# Standard Chartered Straight2Bank (S2B) / Open Banking
SCB_S2B_CLIENT_ID=your_scb_client_id
SCB_S2B_CLIENT_SECRET=your_scb_client_secret

# -------------------------------------------------------------
# 3. Unified Checkout & Remittance (PayPal / Pesapal)
# -------------------------------------------------------------
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_ENVIRONMENT=sandbox # 'sandbox' or 'live'
PESAPAL_CONSUMER_KEY=your_pesapal_consumer_key
PESAPAL_CONSUMER_SECRET=your_pesapal_consumer_secret

# -------------------------------------------------------------
# 4. KRA eTIMS (Electronic Tax Invoice Management System)
# -------------------------------------------------------------
KRA_ETIMS_ENDPOINT=https://etims-vscu.kra.go.ke/api/v1
KRA_TAXPAYER_PIN=P051234567Z
KRA_DEVICE_SERIAL=VSCU_SERIAL_90123
KRA_VSCU_KEY=your_kra_vscu_cryptographic_key

# -------------------------------------------------------------
# 5. AI Advisor & Market Intelligence
# -------------------------------------------------------------
OPENROUTER_API_KEY=your_openrouter_api_key
```

---

## 🗄️ Database Setup (PostgreSQL & Python Models)

1. Create the PostgreSQL database:
   ```bash
   createdb -U postgres finance_dashboard
   ```
2. Initialize tables:
   ```bash
   psql -U postgres -d finance_dashboard -f schema.sql
   ```
3. The schema maps 1-to-1 with `models.py`:
   - `users`
   - `financial_accounts`
   - `financial_transactions`
   - `mpesa_callbacks`
   - `bank_connections`
   - `checkout_orders`
   - `etims_invoices`
   - `portfolio_holdings`
