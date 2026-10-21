"""
Kenya Financial Dashboard & Ecosystem - Financial Records and Models
Replaces legacy Plaid/Mono models with native Kenya rails:
- Safaricom M-Pesa Daraja 2.0 (STK Push, C2B, B2C, Balance, Callbacks)
- Kenyan Direct Banking Gateways (Equity Jenga, KCB Buni, Co-op Bank, Standard Chartered, Pesalink)
- Unified Checkout & Aggregators (PayPal, Mobile Money, Cards)
- KRA eTIMS Fiscalization & Tax Compliance (VSCU/OSCU, CUIN, QR Codes)
- Wealth & Portfolio Domain (CBK T-Bills, Infrastructure Bonds, MMFs, NSE, Saccos)
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr


# ==========================================
# 1. CORE USER & ACCOUNT MODELS
# ==========================================

class UserRole(str, Enum):
    INDIVIDUAL = "individual"
    BUSINESS = "business"
    SOLE_PROPRIETOR = "sole_proprietor"


class User(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    phone_number: str = Field(..., description="Kenyan phone number e.g. 254712345678")
    kra_pin: Optional[str] = Field(None, description="KRA PIN for eTIMS compliance (e.g. A012345678Z)")
    role: UserRole = UserRole.INDIVIDUAL
    country: str = "KE"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AccountType(str, Enum):
    MPESA_WALLET = "M-Pesa Wallet"
    MPESA_PAYBILL = "M-Pesa Paybill / Till"
    BANK_CHECKING = "Checking / Current"
    BANK_SAVINGS = "Savings"
    SACCO_DEPOSIT = "Sacco FOSA/BOSA"
    MMF = "Money Market Fund"
    TREASURY_BONDS = "CBK Treasury Bond / CSD"
    PAYPAL_WALLET = "PayPal Balance"


class FinancialAccount(BaseModel):
    id: int
    user_id: int
    institution_code: str = Field(..., description="SAFARICOM, EQUITY, KCB, COOP, SCB, PAYPAL, CIC_MMF")
    institution_name: str
    account_number_mask: str = Field(..., description="e.g. 2547****123 or ****5678")
    account_type: AccountType
    currency: str = "KES"
    available_balance: float = 0.0
    actual_balance: float = 0.0
    is_active: bool = True
    last_synced_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ==========================================
# 2. M-PESA DARAJA 2.0 MODELS
# ==========================================

class MpesaTransactionType(str, Enum):
    PAYBILL = "CustomerPayBillOnline"
    BUY_GOODS = "CustomerBuyGoodsOnline"
    STK_PUSH = "LipaNaMpesaOnline"
    B2C_PAYMENT = "BusinessPayment"
    B2C_SALARY = "SalaryPayment"
    B2C_PROMOTION = "PromotionPayment"
    ACCOUNT_BALANCE = "AccountBalance"
    REVERSAL = "TransactionReversal"


class DarajaSTKPushRequest(BaseModel):
    phone_number: str = Field(..., description="2547XXXXXXXX")
    amount: float = Field(..., gt=0)
    account_reference: str = Field(..., max_length=12, description="e.g. Invoice102 or RentOct")
    transaction_desc: str = Field(..., max_length=20, description="Description shown to user")
    callback_url: Optional[str] = None


class DarajaCallbackItem(BaseModel):
    Name: str
    Value: Optional[Any] = None


class DarajaCallbackMetadata(BaseModel):
    Item: List[DarajaCallbackItem]


class DarajaStkCallbackBody(BaseModel):
    MerchantRequestID: str
    CheckoutRequestID: str
    ResultCode: int
    ResultDesc: str
    CallbackMetadata: Optional[DarajaCallbackMetadata] = None


class DarajaStkCallbackPayload(BaseModel):
    Body: Dict[str, Any]


class MpesaC2BValidationConfirmation(BaseModel):
    """
    Standard Safaricom C2B Validation/Confirmation callback payload
    """
    TransactionType: str
    TransID: str = Field(..., description="M-Pesa Receipt Number e.g. RJL792XYZ1")
    TransTime: str = Field(..., description="Format: YYYYMMDDHHmmss")
    TransAmount: float
    BusinessShortCode: str
    BillRefNumber: Optional[str] = None
    InvoiceNumber: Optional[str] = None
    OrgAccountBalance: Optional[str] = None
    ThirdPartyTransID: Optional[str] = None
    MSISDN: str = Field(..., description="Customer phone number e.g. 2547XXXXXXXX")
    FirstName: Optional[str] = None
    MiddleName: Optional[str] = None
    LastName: Optional[str] = None


# ==========================================
# 3. DIRECT KENYAN BANKING MODELS
# ==========================================

class KenyanBankCode(str, Enum):
    EQUITY = "EQUITY_KE"      # Jenga API / Finserve
    KCB = "KCB_KE"            # Buni Open Banking API
    COOP = "COOP_KE"          # Co-operative Bank Open Banking
    STANCHART = "SCB_KE"      # Standard Chartered Straight2Bank / Open Banking
    PESALINK = "PESALINK_KE"  # IPMC / Pesalink interbank rail


class BankConnectionStatus(str, Enum):
    CONNECTED = "connected"
    TOKEN_EXPIRED = "token_expired"
    AUTHENTICATION_REQUIRED = "authentication_required"
    DISCONNECTED = "disconnected"


class DirectBankCredential(BaseModel):
    id: int
    user_id: int
    bank_code: KenyanBankCode
    account_number: str
    api_client_id: Optional[str] = None
    status: BankConnectionStatus = BankConnectionStatus.CONNECTED
    consent_id: Optional[str] = None
    access_token_expires_at: Optional[datetime] = None
    last_pull_timestamp: Optional[datetime] = None


class DirectBankTransferRequest(BaseModel):
    source_bank: KenyanBankCode
    source_account: str
    destination_type: str = Field(..., description="'BANK' (via Pesalink/EFT) or 'MPESA'")
    destination_account: str = Field(..., description="Bank Account Number or M-Pesa Phone")
    amount: float = Field(..., gt=0)
    currency: str = "KES"
    narrative: str = Field(..., max_length=50)


# ==========================================
# 4. UNIFIED CHECKOUT & AGGREGATOR MODELS
# ==========================================

class PaymentProvider(str, Enum):
    MPESA_EXPRESS = "mpesa_express"
    PAYPAL = "paypal"
    PESAPAL = "pesapal"
    FLUTTERWAVE = "flutterwave"
    DIRECT_BANK = "direct_bank"


class UnifiedCheckoutIntent(BaseModel):
    order_id: str
    user_id: int
    amount: float
    currency: str = "KES"
    target_currency: str = "KES"
    exchange_rate: float = 1.0
    description: str
    customer_email: EmailStr
    customer_phone: Optional[str] = None
    preferred_provider: PaymentProvider
    status: str = "pending"  # pending, completed, failed, refunded
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PayPalCaptureRecord(BaseModel):
    paypal_order_id: str
    paypal_capture_id: str
    payer_email: str
    gross_amount_usd: float
    paypal_fee_usd: float
    net_amount_usd: float
    settled_kes_amount: float
    fx_rate: float
    captured_at: datetime = Field(default_factory=datetime.utcnow)


# ==========================================
# 5. KRA eTIMS TAX COMPLIANCE & ACCOUNTING
# ==========================================

class EtimsTaxRate(str, Enum):
    STANDARD_VAT_16 = "A"   # 16% VAT
    ZERO_RATED_0 = "B"      # 0% VAT
    EXEMPT = "C"            # Exempt from VAT
    SPECIAL_RATE_8 = "E"    # 8% (e.g. Fuel prior or specific supplies)


class EtimsItemLine(BaseModel):
    item_code: str
    item_description: str
    quantity: float
    unit_price: float
    tax_rate_type: EtimsTaxRate = EtimsTaxRate.STANDARD_VAT_16
    tax_amount: float
    total_amount: float


class EtimsFiscalInvoice(BaseModel):
    invoice_id: str
    transaction_id: Optional[str] = None
    taxpayer_kra_pin: str = Field(..., description="e.g. P051234567Z")
    customer_kra_pin: Optional[str] = None
    customer_name: str
    cuin: str = Field(..., description="Control Unit Invoice Number issued by eTIMS VSCU")
    fiscal_receipt_number: str
    invoice_date: datetime
    total_taxable_amount: float
    total_tax_amount: float
    grand_total: float
    qr_code_url: str = Field(..., description="KRA validation URL to inspect receipt on KRA portal")
    vscu_status: str = "FISCALIZED"  # PENDING, FISCALIZED, REJECTED
    vscu_signature: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ==========================================
# 6. WEALTH, INVESTMENTS & CBK ASSETS
# ==========================================

class AssetType(str, Enum):
    MMF = "Money Market Fund"
    CBK_TBILL = "Central Bank Treasury Bill"
    CBK_IFB = "Infrastructure Bond (Tax-Free)"
    NSE_STOCK = "Nairobi Securities Exchange Equities"
    SACCO_DIVIDEND = "Sacco Shares / Capital"


class InvestmentHolding(BaseModel):
    id: int
    user_id: int
    asset_type: AssetType
    institution_name: str  # e.g., 'CIC Asset Management', 'Sanlam MMF', 'CBK CSD', 'Safaricom (SCOM)'
    holding_name: str
    principal_invested: float
    current_valuation: float
    accrued_interest_or_dividend: float
    annualized_yield_percent: float  # e.g. 15.5% for T-Bills, 13.2% for MMF
    maturity_date: Optional[date] = None
    is_tax_exempt: bool = False  # True for IFBs


# ==========================================
# 7. UNIFIED FINANCIAL TRANSACTION RECORD
# ==========================================

class FinancialTransaction(BaseModel):
    id: int
    account_id: int
    source_rail: str = Field(..., description="MPESA_DARAJA, EQUITY_JENGA, KCB_BUNI, COOP, SCB, PAYPAL")
    rail_reference: str = Field(..., description="e.g. M-Pesa TransID RJL792XYZ1 or Bank Ref")
    amount: float
    currency: str = "KES"
    date: date
    merchant_or_party: str
    category: str
    type: str = "debit"  # debit or credit
    balance_after: Optional[float] = None
    etims_invoice_id: Optional[str] = None
    is_reconciled: bool = False
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ==========================================
# 8. AI FINANCIAL ADVISOR & SYNTHESIS
# ==========================================

class AdvisorQuery(BaseModel):
    user_id: int
    query: str
    include_cash_flow_summary: bool = True
    include_etims_tax_liability: bool = True
    include_investment_projections: bool = True


class AdvisorResponse(BaseModel):
    advice_text: str
    recommended_actions: List[str]
    tax_optimization_tips: List[str]
    liquidity_warning: Optional[str] = None
    suggested_allocations: Dict[str, float] = Field(default_factory=dict)
