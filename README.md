# Kenya Personal Finance & Wealth Dashboard 🇰🇪

A comprehensive, production-ready financial ecosystem built for Kenya and East Africa. Powered by **Next.js 16**, **TypeScript**, **Python Pydantic/SQLAlchemy Models (`models.py`)**, and native Kenyan financial rails.

---

## 🧭 Why Native Rails for Kenya?

- **Mono Has Critical Limitations**: Mono's coverage in Kenya depends primarily on fragile screen-scraping which breaks with bank 2FA/OTPs and does not provide real-time Safaricom C2B callbacks.
- **The Native Solution**:
  1. **Safaricom M-Pesa Daraja 2.0**: The primary lifeline of personal cash flow in Kenya. Handles Lipa Na M-Pesa Online (STK Push) and instant C2B/B2C callbacks.
  2. **Kenyan Direct Banking Gateways**: Open banking connectors for **Equity Bank (Jenga API v3)**, **KCB Bank (Buni API)**, **Co-operative Bank**, and **Standard Chartered (Straight2Bank)**, bridged by the **Pesalink** interbank rail.
  3. **Unified Checkout & Aggregators**: **PayPal** orders capture for USD remittances and freelance earnings with live KES FX conversion, alongside card aggregators (Pesapal / Flutterwave).
  4. **KRA eTIMS Tax Compliance**: Real-time sales fiscalization via KRA's Virtual Sales Control Unit (VSCU) / OSCU, generating **Control Unit Invoice Numbers (CUIN)**, 16% VAT computations, and official KRA verification QR codes.
  5. **Central Bank of Kenya (CBK) Wealth Domain**: Modeling 91/182/364-day Treasury Bills, Infrastructure Bonds (IFB tax-free), Money Market Funds (MMFs), and NSE equities.
  6. **Simba AI Financial Advisor**: Tailored Kenyan financial advisory powered by OpenRouter / LLMs.

---

## 🏛️ System Architecture

Refer to the complete architectural blueprint artifact:
[financial_dashboard_kenya_architecture.md](file:///C:/Users/USER/.gemini/antigravity-ide/brain/43771c18-8c58-4258-abca-650ecc80420b/financial_dashboard_kenya_architecture.md)

- **Topmost Box**: `Users` (Individual, MSME, Merchant, Freelancer)
- **User Experience**: Cash Flow, Portfolio, AI Advisor Panel, Unified Checkout, and KRA eTIMS Hub
- **API Surface**: `/api/mpesa/*`, `/api/banks/*`, `/api/checkout`, `/api/compliance/etims`, `/api/wealth/portfolio`, `/api/advisor/chat`
- **Bottommost Box**: `Financial records, models.py` and `schema.sql`

---

## 🚀 Quick Start

### 1. Install & Run
```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Database & Data Models
- Data models: [models.py](file:///c:/Users/USER/OneDrive/Desktop/School/My-Financial-Dashboard/models.py)
- Database schema: [schema.sql](file:///c:/Users/USER/OneDrive/Desktop/School/My-Financial-Dashboard/schema.sql)
