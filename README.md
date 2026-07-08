# PeptidesDirect Partner API Example

A typed TypeScript client and a runnable end-to-end example for the PeptidesDirect Partner / Reseller Order API.

## Install

```bash
npm install
```

## Authentication

Every request is authenticated with a per-partner API key, sent as:

```
Authorization: Bearer pk_live_xxx
```

Keys are issued per partner by PeptidesDirect. Read your key from an environment variable, for example `PARTNER_API_KEY`, and never commit it to source control.

## Quick start

```typescript
import { PartnerApiClient } from "./src/client.js";

const client = new PartnerApiClient({
  apiKey: process.env.PARTNER_API_KEY!,
});

const catalog = await client.getCatalog();

const order = await client.createOrder({
  partnerOrderRef: "my-system-order-42",
  items: [{ sku: catalog.items[0].sku, qty: 1 }],
  shipTo: {
    firstName: "Anna",
    lastName: "Muster",
    street: "Musterstrasse 12",
    city: "Berlin",
    postalCode: "10115",
    country: "DE",
  },
});

console.log(order.orderNumber, order.amountDue, order.paymentInstructions);
```

Run the full example (catalog, order, payment report, status poll) with:

```bash
PARTNER_API_KEY=pk_live_xxx npm run example
```

## Endpoint reference

Base URL: `https://api.peptidesdirect.io/v1/partner`. All requests and responses are JSON, currency is always EUR.

| Method | Path                     | Description                                              |
| ------ | ------------------------ | ---------------------------------------------------------- |
| GET    | `/catalog`               | List your SKUs, stock, retail price and your net price   |
| POST   | `/orders`                | Create a new order                                        |
| POST   | `/orders/:id/payment`    | Report that you have paid an order (SEPA or crypto)      |
| GET    | `/orders/:id`            | Get an order's current status, items, tracking, invoice  |
| GET    | `/orders`                | List your orders, paginated, optionally filtered by status |
| GET    | `/orders/:id/invoice`    | Download the invoice as a PDF stream                      |

### GET /catalog

Returns `{ currency, discountPercent, items }` where each item is `{ sku, productName, dosage, retailPrice, netPrice, stock, inStock }`. `sku` is the identifier you use when placing an order.

### POST /orders

Body: `{ partnerOrderRef?, items: [{ sku, qty }], shipTo, endCustomerEmail? }`. You never send prices - `netPrice` is always computed server-side from the current catalog and your discount.

Returns `201` with `{ orderId, orderNumber, partnerOrderRef?, status, currency, amountDue, paymentInstructions: { sepa?, crypto? } }`.

### POST /orders/:id/payment

Body: `{ method: "sepa" | "crypto", txHash?, reference? }`.

Returns `{ orderId, status }` where status is `"payment_reported"`, `"already_confirmed"` or `"order_cancelled"`.

### GET /orders/:id

Returns `{ orderId, orderNumber, partnerOrderRef?, status, currency, amountDue, items, tracking, invoiceUrl }`. `tracking` is `null` until the order has shipped, `invoiceUrl` is `null` until an invoice has been generated.

### GET /orders

Query params: `status?`, `limit?` (1-200, default 50), `offset?` (>= 0). Returns `{ total, limit, offset, orders }`.

### GET /orders/:id/invoice

Streams the invoice as `application/pdf`. Requires the same `Authorization: Bearer` header as every other endpoint.

## Order status values

`pending`, `payment_reported`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`.

## Error codes

Non-2xx responses return `{ code, message }`.

| Code                              | HTTP status | Meaning                                          |
| ---------------------------------- | ----------- | ------------------------------------------------- |
| `UNAUTHORIZED`                    | 401         | Missing or invalid API key                        |
| `INSUFFICIENT_SCOPE`              | 403         | Key is valid but not allowed to do this            |
| `UNKNOWN_SKU`                     | 400         | Order references a SKU that does not exist        |
| `INSUFFICIENT_STOCK`              | 409         | Not enough stock for the requested quantity        |
| `COUNTRY_NOT_SHIPPABLE`           | 422         | We do not ship to the given country at all         |
| `CANARY_NOT_SHIPPABLE`            | 422         | Canary Islands / exclave address is not shippable  |
| `PRODUCT_NOT_SHIPPABLE_TO_COUNTRY`| 422         | This specific product cannot ship to that country  |
| `ORDER_NOT_FOUND`                 | 404         | No order with that id                              |
| `RATE_LIMITED`                    | 429         | You exceeded a rate limit, back off and retry      |

`PartnerApiClient` throws a `PartnerApiError` (extends `Error`) with `status`, `code` and `message` for any of the above.

## Idempotency

There is no idempotency header. Instead, pass a `partnerOrderRef` when creating an order. Re-posting `POST /orders` with the same `partnerOrderRef` returns the existing order instead of creating a duplicate, so it is safe to retry on timeouts.

## Rate limits

Per partner: 100 requests/second, 500 requests/10 seconds, 2000 requests/60 seconds. Exceeding any of these returns `429 RATE_LIMITED`. Back off and retry.

## No webhooks

There are no webhooks. Poll `GET /orders/:id` for status changes and tracking updates.

## Pricing

Partners never send prices. `netPrice` is always `retailPrice * (1 - discountPercent / 100)`, computed server-side from the catalog you fetched, so your quoted amounts always match what gets charged.

## Links

Partner program: https://peptidesdirect.io/partners

## License

MIT
