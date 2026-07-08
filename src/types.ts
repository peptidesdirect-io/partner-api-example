/**
 * Types for the PeptidesDirect Partner / Reseller Order API.
 *
 * Base URL: https://api.peptidesdirect.io/v1/partner
 * All responses are JSON. Currency is always EUR.
 */

/** A shipping/billing address. Country must be an ISO-2 code (e.g. "DE"). */
export interface Address {
  firstName: string;
  lastName: string;
  street: string;
  street2?: string;
  city: string;
  state?: string;
  postalCode: string;
  /** ISO-2 country code, e.g. "DE", "FR", "AT". */
  country: string;
  phone?: string;
}

/** One product line as returned by GET /catalog. */
export interface CatalogItem {
  /** Line-item identifier used in order requests. */
  sku: string;
  productName: string;
  dosage: string;
  /** Public retail price in EUR. */
  retailPrice: number;
  /** Partner net price in EUR (retailPrice with the partner discount already applied). */
  netPrice: number;
  stock: number;
  inStock: boolean;
}

/** Response body of GET /catalog. */
export interface CatalogResponse {
  currency: "EUR";
  /** Partner discount percentage, e.g. 25 for 25%. */
  discountPercent: number;
  items: CatalogItem[];
}

/** One line item in a new order. Prices are never sent by the partner. */
export interface OrderItemInput {
  sku: string;
  /** Integer quantity, must be >= 1. */
  qty: number;
}

/** Request body of POST /orders. */
export interface CreatePartnerOrder {
  /**
   * Optional partner-side reference (max 120 chars).
   * Re-posting the same partnerOrderRef returns the existing order instead
   * of creating a duplicate - use this as your idempotency key.
   */
  partnerOrderRef?: string;
  items: OrderItemInput[];
  shipTo: Address;
  endCustomerEmail?: string;
}

/** SEPA bank transfer instructions for settling an order. */
export interface SepaPaymentInstructions {
  iban: string;
  accountHolder: string;
  reference: string;
}

/** Crypto payment instructions for settling an order. */
export interface CryptoPaymentInstructions {
  coin: string;
  network: string;
  address: string;
  amount: string;
}

/** Payment options returned alongside a newly created order. */
export interface PaymentInstructions {
  sepa?: SepaPaymentInstructions;
  crypto?: CryptoPaymentInstructions;
}

/** All possible order lifecycle states. */
export type OrderStatus =
  | "pending"
  | "payment_reported"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

/** Response body of POST /orders. */
export interface CreateOrderResponse {
  orderId: string;
  orderNumber: string;
  partnerOrderRef?: string;
  status: OrderStatus;
  currency: "EUR";
  amountDue: number;
  paymentInstructions: PaymentInstructions;
}

/** Request body of POST /orders/:id/payment. */
export interface ReportPayment {
  method: "sepa" | "crypto";
  /** Required for crypto payments: the on-chain transaction hash. */
  txHash?: string;
  /** Required for SEPA payments: the transfer reference used. */
  reference?: string;
}

/** Response body of POST /orders/:id/payment. */
export interface ReportPaymentResponse {
  orderId: string;
  status: "payment_reported" | "already_confirmed" | "order_cancelled";
}

/** One line item as returned inside order details. */
export interface OrderDetailsItem {
  sku: string;
  qty: number;
  netPrice: number;
}

/** Shipment tracking info, if the order has shipped. */
export interface OrderTracking {
  carrier: string;
  trackingNumber: string;
}

/** Response body of GET /orders/:id. */
export interface OrderDetails {
  orderId: string;
  orderNumber: string;
  partnerOrderRef?: string;
  status: OrderStatus;
  currency: "EUR";
  amountDue: number;
  items: OrderDetailsItem[];
  tracking: OrderTracking | null;
  invoiceUrl: string | null;
}

/** Query parameters for GET /orders. */
export interface ListOrdersQuery {
  status?: OrderStatus;
  /** 1-200, default 50. */
  limit?: number;
  /** >= 0. */
  offset?: number;
}

/** Response body of GET /orders. */
export interface OrderListResponse {
  total: number;
  limit: number;
  offset: number;
  orders: OrderDetails[];
}

/** Error codes the API can return in a PartnerApiError body. */
export type PartnerApiErrorCode =
  | "UNAUTHORIZED"
  | "INSUFFICIENT_SCOPE"
  | "UNKNOWN_SKU"
  | "INSUFFICIENT_STOCK"
  | "COUNTRY_NOT_SHIPPABLE"
  | "CANARY_NOT_SHIPPABLE"
  | "PRODUCT_NOT_SHIPPABLE_TO_COUNTRY"
  | "ORDER_NOT_FOUND"
  | "RATE_LIMITED";

/** Shape of a non-2xx JSON error body. */
export interface PartnerApiErrorBody {
  code: PartnerApiErrorCode;
  message: string;
}
