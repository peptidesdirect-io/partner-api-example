import type {
  CatalogResponse,
  CreateOrderResponse,
  CreatePartnerOrder,
  ListOrdersQuery,
  OrderDetails,
  OrderListResponse,
  PartnerApiErrorBody,
  ReportPayment,
  ReportPaymentResponse,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.peptidesdirect.io/v1/partner";

/**
 * Thrown for any non-2xx response. Carries the HTTP status plus the
 * machine-readable error code and message from the API body.
 */
export class PartnerApiError extends Error {
  readonly status: number;
  readonly code: PartnerApiErrorBody["code"];

  constructor(status: number, body: PartnerApiErrorBody) {
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

  /** GET /catalog - your product list with SKUs, stock and your net prices. */
  async getCatalog(): Promise<CatalogResponse> {
    return this.request<CatalogResponse>("GET", "/catalog");
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
      const body = (await res.json().catch(() => null)) as PartnerApiErrorBody | null;
      throw new PartnerApiError(
        res.status,
        body ?? { code: "ORDER_NOT_FOUND", message: "Failed to download invoice" },
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

    const json = (await res.json()) as unknown;

    if (!res.ok) {
      throw new PartnerApiError(res.status, json as PartnerApiErrorBody);
    }

    return json as T;
  }
}
