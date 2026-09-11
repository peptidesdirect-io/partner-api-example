/**
 * Types for the PeptidesDirect Partner / Reseller Order API.
 *
 * Base URL: https://api.peptidesdirect.io/v1/partner
 * All responses are JSON except GET /orders/:id/invoice, which streams a PDF.
 * Currency is always EUR.
 *
 * Interactive reference (OpenAPI): https://api.peptidesdirect.io/v1/docs
 */

/**
 * A shipping/billing address. For `country`, an ISO-2 code (e.g. "DE") is
 * preferred; ISO-3 codes and the aliases "UK" and "EL" are also accepted and
 * are canonicalised server-side.
 */
export interface Address {
  firstName: string;
  lastName: string;
  street: string;
  street2?: string;
  city: string;
  state?: string;
  postalCode: string;
  /**
   * ISO country code, e.g. "DE", "FR", "GB". ISO-3 codes and the aliases
   * "UK" and "EL" are canonicalised server-side ("UK" -> "GB", "EL" -> "GR").
   */
  country: string;
  phone?: string;
}

/**
 * One certificate of analysis (CoA / lab report) as exposed on the partner API.
 * Returned as a list on catalog items and as the single latest report on order
 * detail lines.
 */
export interface PartnerCoa {
  batchNumber: string;
  /** ISO date, "YYYY-MM-DD". */
  testDate: string | null;
  labName: string;
  /** Purity in percent, e.g. 99.2. Null for CoAs that report content instead. */
  purity: number | null;
  /** Link to the CoA document, if published. */
  reportUrl: string | null;
  /** One-click lab verification link (e.g. Janoshik), if the lab exposes one. */
  verificationUrl: string | null;
  /** Public verify page the vial QR code resolves to, if the batch has a code. */
  publicUrl: string | null;
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
  /** All certificates of analysis on file for this product, newest test first. */
  labReports: PartnerCoa[];
}

/** Response body of GET /catalog. */
export interface CatalogResponse {
  currency: "EUR";
  /** Partner discount percentage, e.g. 25 for 25%. */
  discountPercent: number;
  items: CatalogItem[];
}

/** Shipping zones a destination can fall into. */
export type ShippingZone = "de" | "eu" | "nonEu";

/** One zone row of the full shipping-rate table. */
export interface ShippingZoneRate {
  zone: ShippingZone;
  /** Flat rate in EUR, charged per order and never discounted. */
  rate: number;
  /**
   * ISO-2 codes in this zone, or null for the nonEu zone, which means
   * "every country not listed in another zone".
   */
  countries: string[] | null;
}

/** Response of GET /shipping/quote without a country: the whole rate table. */
export interface ShippingQuoteTable {
  currency: "EUR";
  /** Always null: partner shipping has no free-shipping threshold. */
  freeShippingThreshold: null;
  /** ISO-2 codes we currently do not ship to at all. */
  blockedCountries: string[];
  zones: ShippingZoneRate[];
}

/** Response of GET /shipping/quote?country=XX: the rate for one destination. */
export interface ShippingQuoteForCountry {
  currency: "EUR";
  /** The canonicalised ISO-2 code the quote was resolved for. */
  country: string;
  zone: ShippingZone;
  shippable: boolean;
  /** Flat rate in EUR, or null when the destination is not shippable. */
  rate: number | null;
  /** Always null: partner shipping has no free-shipping threshold. */
  freeShippingThreshold: null;
}

/** Either shape GET /shipping/quote can return. */
export type ShippingQuoteResponse = ShippingQuoteTable | ShippingQuoteForCountry;

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
  /** Stored for the customs declaration only, never emailed (white-label). */
  endCustomerEmail?: string;
}

/** SEPA bank transfer instructions for settling an order. */
export interface SepaPaymentInstructions {
  iban: string;
  accountHolder: string;
  /** Use the order number as the transfer reference. */
  reference: string;
}

/** Crypto payment instructions for settling an order. */
export interface CryptoPaymentInstructions {
  coin: string;
  network: string;
  address: string;
  /** Amount in EUR (same value as amountDue). */
  amount: number;
}

/**
 * Payment options returned alongside a newly created order. Both rails are
 * always present; individual fields can be empty strings when a rail is not
 * configured, so check `iban` / `address` before using them.
 */
export interface PaymentInstructions {
  sepa: SepaPaymentInstructions;
  crypto: CryptoPaymentInstructions;
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
  partnerOrderRef: string | null;
  status: OrderStatus;
  currency: "EUR";
  /** Net product total in EUR (your discount already applied). */
  subtotal: number;
  /** Flat shipping rate in EUR, charged in full and never discounted. */
  shippingCost: number;
  /** subtotal + shippingCost, the amount to transfer. */
  amountDue: number;
  paymentInstructions: PaymentInstructions;
}

/** Request body of POST /orders/:id/payment. */
export interface ReportPayment {
  method: "sepa" | "crypto";
  /** For crypto payments: the on-chain transaction hash. */
  txHash?: string;
  /** For SEPA payments: the transfer reference used. */
  reference?: string;
}

/** Response body of POST /orders/:id/payment. */
export interface ReportPaymentResponse {
  orderId: string;
  status: "payment_reported" | "already_confirmed" | "order_cancelled";
}

/** Response body of POST /orders/:id/cancel. */
export interface CancelOrderResponse {
  orderId: string;
  status: "cancelled";
}

/** One line item as returned inside order details. */
export interface OrderDetailsItem {
  sku: string;
  qty: number;
  netPrice: number;
  /** Latest certificate of analysis = the batch currently shipping, if any. */
  coa: PartnerCoa | null;
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
  partnerOrderRef: string | null;
  status: OrderStatus;
  currency: "EUR";
  subtotal: number;
  shippingCost: number;
  amountDue: number;
  items: OrderDetailsItem[];
  tracking: OrderTracking | null;
  invoiceUrl: string | null;
}

/** One row of GET /orders. Lighter than OrderDetails: no items or tracking. */
export interface OrderSummary {
  orderId: string;
  orderNumber: string;
  partnerOrderRef: string | null;
  status: OrderStatus;
  subtotal: number;
  shippingCost: number;
  amountDue: number;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** Query parameters for GET /orders. */
export interface ListOrdersQuery {
  status?: OrderStatus;
  /** 1-200, default 50. */
  limit?: number;
  /** >= 0. */
  offset?: number;
}

/** Response body of GET /orders. Newest order first. */
export interface OrderListResponse {
  total: number;
  limit: number;
  offset: number;
  orders: OrderSummary[];
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
  | "GB_MIN_ORDER_VALUE"
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_CANCELLABLE"
  | "RATE_LIMITED";

/** Shape of a non-2xx JSON error body. */
export interface PartnerApiErrorBody {
  code: PartnerApiErrorCode;
  message: string;
}
