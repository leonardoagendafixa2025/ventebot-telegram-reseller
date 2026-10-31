// Tipos oficiais baseados na especificação OpenAPI da VenteBot Reseller API v1.2.0

export type VenteBotPricingType = "standard" | "reseller_global" | "reseller_special";

export type VenteBotDeliveryType = "stock" | "activation" | "supplier_api" | "api_test";

export type VenteBotOrderStatus =
  | "COMPLETED"
  | "PAID_PENDING_DELIVERY"
  | "AWAITING_ACTIVATION_INFO"
  | "AWAITING_ACTIVATION"
  | "CANCELLED";

export interface VenteBotError {
  success: false;
  code?: string;
  message: string;
  details?: Array<{
    loc?: string[];
    msg?: string;
    type?: string;
  }>;
}

export interface VenteBotMeResponse {
  success: boolean;
  user_telegram_id: number;
  username: string | null;
  first_name: string | null;
  wallet_balance: number;
  key_name: string;
  key_prefix: string;
}

export interface VenteBotPriceTier {
  min_qty: number;
  max_qty: number | null;
  price_usd: number;
}

export interface VenteBotProduct {
  id: number;
  name: string;
  description: string;
  emoji: string | null;
  image_url: string | null;
  price_usd: number;
  standard_price_usd: number | null;
  pricing_type: VenteBotPricingType;
  special_price_expires_at: string | null;
  warranty_days: number;
  delivery_type: VenteBotDeliveryType;
  stock: number | null;
  price_tiers: VenteBotPriceTier[];
  api_test: boolean;
}

export interface VenteBotQuoteRequest {
  product_id: number | string;
  quantity?: number | string;
}

export interface VenteBotQuoteResponse {
  success: boolean;
  quote: {
    product_id: number;
    quantity: number;
    unit_price: number;
    standard_unit_price: number | null;
    pricing_type: VenteBotPricingType;
    total: number;
  };
}

export interface VenteBotOrderItem {
  id: number;
  account_data: string;
}

export interface VenteBotOrder {
  id: number;
  order_number: number;
  status: VenteBotOrderStatus;
  product_id: number;
  product_name: string;
  quantity: number;
  amount_usd: number;
  delivery_type: VenteBotDeliveryType | string;
  customer_reference: string;
  idempotency_key: string;
  activation_identifier: string | null;
  created_at: string;
  items: VenteBotOrderItem[];
}

export interface VenteBotCreateOrderRequest {
  product_id: number | string;
  quantity?: number | string;
  activation_identifier?: string;
  customer_reference?: string;
  idempotency_key?: string;
}

export interface VenteBotCreateOrderResponse {
  success: boolean;
  status: string;
  idempotent: boolean;
  balance_after?: number | null;
  unit_price?: number | null;
  standard_unit_price?: number | null;
  pricing_type?: VenteBotPricingType | null;
  total?: number | null;
  order: VenteBotOrder;
}

export interface VenteBotSubmitActivationRequest {
  activation_identifier: string;
}

export interface VenteBotSubmitActivationResponse {
  success: boolean;
  status: string;
  order: VenteBotOrder;
}

export interface VenteBotWalletTransaction {
  id: number;
  user_telegram_id: number;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
  tx_hash: string | null;
}

/**
 * Interface desacoplada de provedor de fornecedor
 */
export interface SupplierProvider {
  getBalance(): Promise<{ balance_usd: number; user_telegram_id: number; key_name: string }>;
  getProducts(): Promise<VenteBotProduct[]>;
  getQuote(productId: number, quantity: number): Promise<VenteBotQuoteResponse["quote"]>;
  createOrder(params: VenteBotCreateOrderRequest): Promise<VenteBotCreateOrderResponse>;
  getOrder(orderId: number): Promise<VenteBotOrder>;
  submitActivationIdentifier(
    orderId: number,
    identifier: string
  ): Promise<VenteBotOrder>;
  getWalletTransactions(): Promise<VenteBotWalletTransaction[]>;
}
