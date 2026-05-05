export type Currency = "INR" | "JPY";

export type CountryCode = "IN" | "JP";

export type UserType = "consumer" | "merchant" | "admin";

export type KycStatus = "pending" | "verified" | "rejected";

export type MerchantStatus = "active" | "suspended" | "inactive";

export type PaymentMethod = "upi" | "jpy_bank_transfer" | "jpy_card" | "konbini";

export type PaymentIntentStatus =
  | "created"
  | "processing"
  | "completed"
  | "failed"
  | "refunded"
  | "disputed";

export type TransactionType = "payment" | "refund" | "chargeback" | "settlement";

export type TransactionStatus = "pending" | "completed" | "failed" | "reversed";

export type LedgerEntryType = "debit" | "credit";

export type AccountType =
  | "user_wallet"
  | "merchant_settlement"
  | "fx_reserve"
  | "fee_account";

export type SettlementStatus = "pending" | "processing" | "completed" | "failed";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface PublicUser {
  id: string;
  email: string;
  userType: UserType;
  kycStatus: KycStatus;
  countryCode: CountryCode;
  createdAt: string;
}

export interface PublicMerchant {
  merchantId: string;
  businessName: string;
  settlementCurrency: Currency;
  status: MerchantStatus;
  webhookUrl: string | null;
}
