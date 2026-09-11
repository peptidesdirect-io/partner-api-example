# PeptidesDirect Partner API Example

A typed TypeScript client and a runnable end-to-end example for the PeptidesDirect Partner / Reseller Order API.

[![CI](https://github.com/peptidesdirect-io/partner-api-example/actions/workflows/ci.yml/badge.svg)](https://github.com/peptidesdirect-io/partner-api-example/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Zero runtime dependencies](https://img.shields.io/badge/dependencies-0_runtime-brightgreen)

## Quick start

```bash
npm install
PARTNER_API_KEY=pk_live_xxx npm run example
```

```typescript
import { PartnerApiClient } from "./src/client.js";

const client = new PartnerApiClient({
  apiKey: process.env.PARTNER_API_KEY!,
});

const catalog = await client.getCatalog();

// Know the flat shipping rate (and whether we serve the destination) first.
const quote = await client.getShippingQuote("DE");

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

console.log(quote.rate, order.orderNumber, order.amountDue, order.paymentInstructions);
```

## Table of contents

- [Install](#install)
- [Authentication](#authentication)
- [Quick start](#quick-start)
- [Example output](#example-output)
- [Endpoint reference](#endpoint-reference)
- [Order status values](#order-status-values)
- [Shipping destinations](#shipping-destinations)
- [Cancelling an order](#cancelling-an-order)
- [Error codes](#error-codes)
- [Idempotency](#idempotency)
- [Rate limits](#rate-limits)
- [No webhooks](#no-webhooks)
- [Pricing](#pricing)
- [See also](#see-also)
- [Contributing](#contributing)
- [Security](#security)
- [Links](#links)
- [License](#license)

## Install

```bash
npm install
```

## Authentication

Every request is authenticated with a per-partner API key, sent as:

```
Authorization: Bearer pk_live_xxx
```

Keys are issued per partner by PeptidesDirect. To request a key, apply to the partner program at https://peptidesdirect.io/partners or email support@peptidesdirect.io. Once approved you receive a `pk_live_...` key (shown once). Read your key from an environment variable, for example `PARTNER_API_KEY`, and never commit it to source control.

Each key carries scopes: `catalog:read`, `orders:read`, `orders:write`, `invoices:read`. The scope each endpoint needs is listed in the [endpoint reference](#endpoint-reference); calling an endpoint your key does not have the scope for returns `403 INSUFFICIENT_SCOPE`. Revoking a key takes effect immediately.

Run the full example (catalog, shipping quote, order, payment report, status poll) with:

```bash
PARTNER_API_KEY=pk_live_xxx npm run example
```

## Example output

Illustrative only. Account-specific values are shown as placeholders: actual SKUs, batches, amounts, discounts and order numbers depend on your catalog and your account.

```
Fetching catalog...
Catalog has <n> items, partner discount <your discount>%
Selected item: PD-RETATRUTIDE-5MG (Retatrutide 5mg), net EUR 00.00
Latest CoA: batch <batch>, Janoshik, purity 00.0%
Quoting shipping to DE...
Shipping to DE (zone de): EUR 00.00
Creating order...
Order PD-2026-00123 created, status=pending
Subtotal EUR 00.00 + shipping EUR 00.00 = due EUR 00.00
Payment instructions: {
  sepa: { iban: 'DE...', accountHolder: '...', reference: 'PD-2026-00123' },
  crypto: { coin: 'USDC', network: 'polygon', address: '0x...', amount: 00.00 }
}
Skipping cancellation (set PARTNER_EXAMPLE_CANCEL=1 to cancel this order instead of paying).
Reporting SEPA payment...
Payment report accepted, status=payment_reported
Fetching order status...
Order PD-2026-00123 status: payment_reported
Tracking: not shipped yet
Invoice URL: not available yet
```

Peptide SKUs typically follow the live catalogue's `PD-<PRODUCT>-<DOSE>` shape (for example `PD-RETATRUTIDE-5MG`); accessories keep their own short codes (for example `SYR-10`). Always use the `sku` string exactly as returned by [`GET /catalog`](#get-catalog), never one you build yourself. Order numbers follow the `PD-<YEAR>-<SEQUENCE>` shape.

## Endpoint reference

Base URL: `https://api.peptidesdirect.io/v1/partner`. All requests and responses are JSON, with one exception: `GET /orders/:id/invoice` streams `application/pdf`. Currency is always EUR. A `GET` on the bare base URL returns `404`, that is expected: there is no index resource.

Interactive reference (OpenAPI / Swagger UI): https://api.peptidesdirect.io/v1/docs, machine-readable at https://api.peptidesdirect.io/v1/docs-json

| Method | Path                  | Scope           | Description                                                 |
| ------ | --------------------- | --------------- | ----------------------------------------------------------- |
| GET    | `/catalog`            | `catalog:read`  | Your SKUs, stock, retail price, your net price, lab reports  |
| GET    | `/shipping/quote`     | `catalog:read`  | Flat shipping rate per destination zone, before ordering     |
| POST   | `/orders`             | `orders:write`  | Create a new order                                           |
| POST   | `/orders/:id/payment` | `orders:write`  | Report that you have paid an order (SEPA or crypto)          |
| POST   | `/orders/:id/cancel`  | `orders:write`  | Cancel a pending, unpaid order and release its stock         |
| GET    | `/orders/:id`         | `orders:read`   | An order's status, items, CoA, tracking, invoice link        |
| GET    | `/orders`             | `orders:read`   | List your orders, paginated, optionally filtered by status   |
| GET    | `/orders/:id/invoice` | `invoices:read` | Download the invoice as a PDF stream                         |

`:id` is the `orderId` (a UUID) returned by `POST /orders`, not the order number.

### GET /catalog

Returns `{ currency, discountPercent, items }`. Each item is `{ sku, productName, dosage, retailPrice, netPrice, stock, inStock, labReports }`. `sku` is the identifier you use when placing an order; only active products with a visible variant are listed, and only those SKUs are orderable.

`labReports` is the list of certificates of analysis on file for that product, newest test date first. Each entry is:

```json
{
  "batchNumber": "…",
  "testDate": "2026-08-14",
  "labName": "Janoshik",
  "purity": 99.2,
  "reportUrl": "https://…",
  "verificationUrl": "https://…",
  "publicUrl": "https://peptidesdirect.io/en/c/…"
}
```

`testDate` is an ISO date (`YYYY-MM-DD`). `purity` is a percentage and is `null` for CoAs that report measured content instead. `reportUrl`, `verificationUrl` and `publicUrl` are `null` when the batch has no published document, no lab verify link, or no public code. `publicUrl` is the same verification page the vial QR code resolves to.

### GET /shipping/quote

Shipping cost lookup before an order exists. Partner shipping is a flat rate per destination zone and has **no free-shipping threshold**, so `freeShippingThreshold` is always `null`.

Query parameter: `country` (ISO-2, ISO-3, or the aliases `UK` / `EL`, which are canonicalised to `GB` / `GR`). It is optional, despite what the generated OpenAPI document says.

With `country`:

```json
{
  "currency": "EUR",
  "country": "DE",
  "zone": "de",
  "shippable": true,
  "rate": 8,
  "freeShippingThreshold": null
}
```

`zone` is `de`, `eu` or `nonEu`. `shippable` is `false` (and `rate` is `null`) for a destination we do not serve, or for a country code that is not a resolvable ISO code.

Without `country`, you get the whole table, which is what you want to cache:

```json
{
  "currency": "EUR",
  "freeShippingThreshold": null,
  "blockedCountries": ["…"],
  "zones": [
    { "zone": "de", "rate": 8, "countries": ["DE"] },
    { "zone": "eu", "rate": 19, "countries": ["…"] },
    { "zone": "nonEu", "rate": 23, "countries": null }
  ]
}
```

`countries: null` on the `nonEu` zone means "every country not listed in another zone". The `eu` zone list contains both `GR` and `EL` for Greece, because the API accepts either spelling and charges both the EU rate. Rates change from time to time, so read them from this endpoint instead of hardcoding them.

### POST /orders

Body: `{ partnerOrderRef?, items: [{ sku, qty }], shipTo, endCustomerEmail? }`. You never send prices: `netPrice` is always computed server-side from the current catalog and your discount. Unknown properties in the body are rejected, so a stray `price` field fails the request rather than being ignored. `endCustomerEmail` is stored for the customs declaration only and is never emailed (white-label).

Returns `201` with `{ orderId, orderNumber, partnerOrderRef, status, currency, subtotal, shippingCost, amountDue, paymentInstructions: { sepa, crypto } }`. `subtotal` is your net product total, `shippingCost` the flat rate for the destination, `amountDue` their sum. `paymentInstructions.sepa` is `{ iban, accountHolder, reference }` (transfer with the order number as reference), `paymentInstructions.crypto` is `{ coin, network, address, amount }`.

Creating an order reserves stock immediately.

### POST /orders/:id/payment

Body: `{ method: "sepa" | "crypto", txHash?, reference? }`.

Returns `{ orderId, status }` where status is `"payment_reported"`, `"already_confirmed"` or `"order_cancelled"`. This is a self-report, not a confirmation: the order stays `payment_reported` until a human verifies that the money arrived.

### POST /orders/:id/cancel

No body. Returns `{ orderId, status: "cancelled" }`. See [Cancelling an order](#cancelling-an-order).

### GET /orders/:id

Returns `{ orderId, orderNumber, partnerOrderRef, status, currency, subtotal, shippingCost, amountDue, items, tracking, invoiceUrl }`.

Each entry in `items` is `{ sku, qty, netPrice, coa }`, where `coa` is the latest certificate of analysis for that product (the batch currently shipping) in the same shape as a `labReports` entry, or `null` if there is none.

`tracking` is `null` until the order has shipped, then `{ carrier, trackingNumber }`. `invoiceUrl` is `null` until an invoice has been generated; partner invoices are issued once the order is confirmed paid, and they are addressed to you, not to the end customer.

### GET /orders

Query params: `status?`, `limit?` (1-200, default 50), `offset?` (>= 0). Returns `{ total, limit, offset, orders }`, newest order first. Each row is `{ orderId, orderNumber, partnerOrderRef, status, subtotal, shippingCost, amountDue, createdAt }`, a summary without `items` or `tracking`: fetch `GET /orders/:id` for those.

### GET /orders/:id/invoice

Streams the invoice as `application/pdf`. Requires the same `Authorization: Bearer` header as every other endpoint.

## Order status values

`pending`, `payment_reported`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`.

These are derived display statuses. `cancelled` also covers refunded and returned orders, and the same values are what `GET /orders?status=` accepts.

## Shipping destinations

Do not hardcode a country list. The destinations we serve, the flat rate for each zone and the list of countries we currently do not ship to at all are exposed by [`GET /shipping/quote`](#get-shippingquote): call it without a parameter for the full table, or with `country=XX` for one destination. The policy changes, the endpoint is the source of truth.

Three things to handle in your integration:

- **Unshippable destinations.** `shippable: false` in the quote. Creating an order for one answers `COUNTRY_NOT_SHIPPABLE`.
- **Minimum order value.** Some destinations only ship above a minimum goods value. Great Britain is currently the one in force: a GB order needs a net goods value of at least **EUR 170** (your net product total, shipping excluded), otherwise the order is refused with `GB_MIN_ORDER_VALUE`. Melanotan-2 is excluded from GB entirely and answers `PRODUCT_NOT_SHIPPABLE_TO_COUNTRY`.
- **Customs exclaves.** Spanish addresses in the Canary Islands (postcodes 35xxx, 38xxx), Ceuta (51xxx) and Melilla (52xxx) are refused with `CANARY_NOT_SHIPPABLE`, even though mainland `ES` is shippable.

For destinations outside the EU customs union the parcel goes through the destination's own import process, and import duties, local taxes and clearance fees are the importer's. Per our published terms every shipment travels at the buyer's risk as importer, and a shipment withheld, seized or destroyed by customs or another authority is neither reshipped nor refunded. That rule is not limited to non-EU destinations (https://peptidesdirect.io/en/legal/terms). Price that risk into your own end-customer terms.

## Cancelling an order

`POST /orders/:id/cancel` cancels an order and releases the stock reserved when it was created.

It is allowed **only while the order is still `pending` and no payment has been reported**. Once you have called `POST /orders/:id/payment`, or once payment has been confirmed and the order has moved on, cancellation is refused with `409 ORDER_NOT_CANCELLABLE` and you have to reach support instead.

It is idempotent: cancelling an already cancelled order returns `{ status: "cancelled" }` again without touching stock a second time.

## Error codes

Contract errors return `{ code, message }`; the client normalises every other non-2xx response to the same shape (see the note below the table).

| Code                               | HTTP status | Meaning                                                   |
| ---------------------------------- | ----------- | --------------------------------------------------------- |
| `UNAUTHORIZED`                     | 401         | Missing, invalid or revoked API key                        |
| `INSUFFICIENT_SCOPE`               | 403         | Key is valid but lacks the scope this endpoint requires    |
| `UNKNOWN_SKU`                      | 400         | Order references a SKU that does not exist or is not sold  |
| `INSUFFICIENT_STOCK`               | 409         | Not enough stock for the requested quantity                |
| `COUNTRY_NOT_SHIPPABLE`            | 422         | We do not ship to the given country at all                 |
| `CANARY_NOT_SHIPPABLE`             | 422         | Canary Islands / Ceuta / Melilla address is not shippable  |
| `PRODUCT_NOT_SHIPPABLE_TO_COUNTRY` | 422         | This specific product cannot ship to that country          |
| `GB_MIN_ORDER_VALUE`               | 422         | GB order below the minimum goods value (EUR 170 net)       |
| `ORDER_NOT_FOUND`                  | 404         | No order with that id for your account                     |
| `ORDER_NOT_CANCELLABLE`            | 409         | Order is past `pending` or a payment was already reported  |
| `RATE_LIMITED`                     | 429         | You exceeded a rate limit, back off and retry              |

`PartnerApiClient` throws a `PartnerApiError` (extends `Error`) with `status`, `code` and `message` for any of the above.

Some responses carry no `code` field at all, and the client maps those by HTTP status. A request-validation failure (a malformed body, an unknown property, or an `:id` that is not a UUID) is rejected by the framework with `400` and surfaces as `code: "VALIDATION_ERROR"`. The IP-level `429` described under [Rate limits](#rate-limits) surfaces as `RATE_LIMITED`. Every other code-less status surfaces as the generic `code: "API_ERROR"`: that covers the `404` that `GET /orders/:id/invoice` answers when the order is yours but no invoice has been generated yet (`invoiceUrl` is still `null`), and any `5xx` the API returns. A `404` for an order that is not yours still carries the documented `ORDER_NOT_FOUND` code.

## Idempotency

There is no idempotency header. Instead, pass a `partnerOrderRef` when creating an order. Re-posting `POST /orders` with the same `partnerOrderRef` returns the existing order instead of creating a duplicate, so it is safe to retry on timeouts, including when two retries race each other.

## Rate limits

Three buckets: 100 requests/second, 500 requests/10 seconds, 2000 requests/60 seconds.

Those thresholds are counted twice: once per partner account, so one partner's traffic never throttles another's, and once per calling IP address as an app-wide backstop in front of the whole API. Whichever trips first answers `429`. The per-partner limit returns the documented `{ code: "RATE_LIMITED" }` body; the IP-level backstop returns a `429` whose body carries no `code` field, which this client also reports as `RATE_LIMITED`. Back off and retry either way.

## No webhooks

There are no webhooks. Poll `GET /orders/:id` for status changes and tracking updates.

## Pricing

Partners never send prices. `netPrice` is always `retailPrice * (1 - discountPercent / 100)`, computed server-side from the catalog you fetched, so your quoted amounts always match what gets charged.

The discount applies to products only. Shipping is charged in full at the flat rate for the destination zone, with no free-shipping threshold, so `amountDue = subtotal + shippingCost`.

## See also

Agent-to-agent payments in USDC over x402 are a separate integration for web-channel orders and are **not** available for partner orders: https://github.com/peptidesdirect-io/x402-payment-example. Partner orders are settled by SEPA transfer or by a crypto transfer to the address in `paymentInstructions.crypto`, reported through `POST /orders/:id/payment`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to run and extend this example, and how to propose changes.

## Security

Never commit a real API key. See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## Links

Partner program: https://peptidesdirect.io/partners

## License

MIT
