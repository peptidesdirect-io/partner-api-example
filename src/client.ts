import type {
  CancelOrderResponse,
  CatalogResponse,
  CreateOrderResponse,
  CreatePartnerOrder,
  ListOrdersQuery,
  OrderDetails,
  OrderListResponse,
  PartnerApiErrorCode,
  ReportPayment,
  ReportPaymentResponse,
  ShippingQuoteForCountry,
  ShippingQuoteResponse,
  ShippingQuoteTable,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.peptidesdirect.io/v1/partner";

/**
 * An error body as seen by this client: either a contract code from the API,
 * or one of two client-side fallback codes for the bodies that carry no `code`
 * at all (RATE_LIMITED is a contract code the API also emits itself).
 * A code-less 400 is a framework-level request-validation failure (a malformed
 * body, an :id that is not a UUID) and becomes "VALIDATION_ERROR". A code-less
 * 429 is the app-wide per-IP rate limit and becomes "RATE_LIMITED". Every other
 * code-less status becomes "API_ERROR": the 404 that GET /orders/:id/invoice
 * answers while no invoice exists yet, and any 5xx from the API.
 */
export interface PartnerApiErrorLike {
  code: PartnerApiErrorCode | "VALIDATION_ERROR" | "API_ERROR";
  message: string;
}

/**
 * Thrown for any non-2xx response. Carries the HTTP status plus the
 * machine-readable error code and message from the API body.
 */
export class PartnerApiError extends Error {
  readonly status: number;
  readonly code: PartnerApiErrorLike["code"];

  constructor(status: number, body: PartnerApiErrorLike) {
    super(`${body.code}: ${body.message} (HTTP ${status})`);
    this.name = "PartnerApiError";
    this.status = status;
    this.code = body.code;
  }
}

export interface PartnerApiClientOptions {
  /** Your partner API key, e.g. "pk_live_xxx". Read this from an env var, never hardcode it. */
  apiKey: string;
  /** Override for testing/staging. Defaults to the production base URL. */
  baseUrl?: string;
}

/**
 * Coerce any error body into the { code, message } shape PartnerApiError expects.
 * A body without a `code` comes from outside the partner module and is mapped by
 * status: 400 is the framework's request validation, 429 is the app-wide per-IP
 * rate limit (a rate limit like any other, reported as such), and anything else
 * is reported as the generic "API_ERROR" rather than mislabelled.
 */
function toErrorBody(
  status: number,
  body: unknown,
  fallbackMessage: string,
): PartnerApiErrorLike {
  const record = (body ?? {}) as Record<string, unknown>;
  const code: PartnerApiErrorLike["code"] =
    typeof record.code === "string"
      ? (record.code as PartnerApiErrorCode)
      : status === 400
        ? "VALIDATION_ERROR"
        : status === 429
          ? "RATE_LIMITED"
          : "API_ERROR";
  const message =
    typeof record.message === "string"
      ? record.message
      : Array.isArray(record.message)
        ? record.message.join(", ")
        : fallbackMessage;
  return { code, message };
}

/**
 * Minimal typed client for the PeptidesDirect Partner / Reseller Order API.
 * Zero runtime dependencies - uses the Node 20+ global fetch.
 */
export class PartnerApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: PartnerApiClientOptions) {
    if (!options.apiKey) {
      throw new Error("PartnerApiClient requires an apiKey");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  /** GET /catalog - your product list with SKUs, stock, net prices and lab reports. */
  async getCatalog(): Promise<CatalogResponse> {
    return this.request<CatalogResponse>("GET", "/catalog");
  }

  /** GET /shipping/quote - the full flat-rate table (zones plus blocked countries). */
  async getShippingQuote(): Promise<ShippingQuoteTable>;
  /** GET /shipping/quote?country=XX - rate and shippability for one destination. */
  async getShippingQuote(country: string): Promise<ShippingQuoteForCountry>;
  async getShippingQuote(country?: string): Promise<ShippingQuoteResponse> {
    if (country !== undefined && country.trim() === "") {
      throw new Error(
        'getShippingQuote() got a blank country string. Pass a country code such as "DE", or call getShippingQuote() with no argument for the full table.',
      );
    }
    const qs = country ? `?country=${encodeURIComponent(country)}` : "";
    return this.request<ShippingQuoteResponse>("GET", `/shipping/quote${qs}`);
  }

  /** POST /orders - create a new order. Use partnerOrderRef as an idempotency key. */
  async createOrder(input: CreatePartnerOrder): Promise<CreateOrderResponse> {
    return this.request<CreateOrderResponse>("POST", "/orders", input);
  }

  /** POST /orders/:id/payment - report that you have paid an order. */
  async reportPayment(orderId: string, body: ReportPayment): Promise<ReportPaymentResponse> {
    return this.request<ReportPaymentResponse>(
      "POST",
      `/orders/${encodeURIComponent(orderId)}/payment`,
      body,
    );
  }

  /**
   * POST /orders/:id/cancel - cancel an order and release its reserved stock.
   * Only possible while the order is still pending with no reported payment;
   * anything later throws ORDER_NOT_CANCELLABLE (HTTP 409). Idempotent:
   * cancelling an already cancelled order succeeds.
   */
  async cancelOrder(orderId: string): Promise<CancelOrderResponse> {
    return this.request<CancelOrderResponse>(
      "POST",
      `/orders/${encodeURIComponent(orderId)}/cancel`,
    );
  }

  /** GET /orders/:id - current status, items, tracking and invoice link for one order. */
  async getOrder(orderId: string): Promise<OrderDetails> {
    return this.request<OrderDetails>("GET", `/orders/${encodeURIComponent(orderId)}`);
  }

  /** GET /orders - paginated list of your orders, optionally filtered by status. */
  async listOrders(query: ListOrdersQuery = {}): Promise<OrderListResponse> {
    const params = new URLSearchParams();
    if (query.status) params.set("status", query.status);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.offset !== undefined) params.set("offset", String(query.offset));
    const qs = params.toString();
    return this.request<OrderListResponse>("GET", `/orders${qs ? `?${qs}` : ""}`);
  }

  /**
   * Builds the URL for GET /orders/:id/invoice (a PDF stream, not JSON).
   * Fetching it still requires the same Authorization: Bearer header used
   * by this client - see downloadInvoicePdf for a ready-made fetch.
   */
  buildInvoiceUrl(orderId: string): string {
    return `${this.baseUrl}/orders/${encodeURIComponent(orderId)}/invoice`;
  }

  /** GET /orders/:id/invoice - downloads the invoice PDF as raw bytes. */
  async downloadInvoicePdf(orderId: string): Promise<ArrayBuffer> {
    const res = await fetch(this.buildInvoiceUrl(orderId), {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as unknown;
      throw new PartnerApiError(
        res.status,
        toErrorBody(res.status, body, "Failed to download invoice"),
      );
    }
    return res.arrayBuffer();
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = (await res.json().catch(() => null)) as unknown;

    if (!res.ok) {
      throw new PartnerApiError(
        res.status,
        toErrorBody(res.status, json, `Request failed (HTTP ${res.status})`),
      );
    }

    return json as T;
  }
}
