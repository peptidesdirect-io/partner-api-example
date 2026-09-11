/**
 * End-to-end example: browse the catalog, quote shipping, place an order, pay
 * it and poll for its status. Run with:
 *
 *   PARTNER_API_KEY=pk_live_xxx npm run example
 *
 * The cancellation step at the end is only demonstrated, never executed,
 * unless you opt in explicitly:
 *
 *   PARTNER_API_KEY=pk_live_xxx PARTNER_EXAMPLE_CANCEL=1 npm run example
 */

import { PartnerApiClient, PartnerApiError } from "../src/client.js";
import type { Address, CreatePartnerOrder } from "../src/types.js";

// Step 0: read the API key from the environment - never hardcode it.
const apiKey = process.env.PARTNER_API_KEY;
if (!apiKey) {
  console.error(
    "Missing PARTNER_API_KEY environment variable.\n" +
      "Set it to your partner API key before running this example, e.g.:\n" +
      "  PARTNER_API_KEY=pk_live_xxx npm run example",
  );
  process.exit(1);
}

const client = new PartnerApiClient({ apiKey });

// The end customer this white-label parcel goes to.
const shipTo: Address = {
  firstName: "Anna",
  lastName: "Muster",
  street: "Musterstrasse 12",
  city: "Berlin",
  postalCode: "10115",
  country: "DE",
  phone: "+49 30 1234567",
};

async function main(): Promise<void> {
  // Step 1: fetch the catalog and pick the first in-stock item.
  console.log("Fetching catalog...");
  const catalog = await client.getCatalog();
  console.log(
    `Catalog has ${catalog.items.length} items, partner discount ${catalog.discountPercent}%`,
  );

  const item = catalog.items.find((it) => it.inStock);
  if (!item) {
    console.error("No in-stock items found in the catalog, aborting.");
    process.exit(1);
  }
  console.log(
    `Selected item: ${item.sku} (${item.productName} ${item.dosage}), net ${catalog.currency} ${item.netPrice}`,
  );

  // Every catalog item carries its certificates of analysis (newest first).
  const coa = item.labReports[0];
  console.log(
    coa
      ? `Latest CoA: batch ${coa.batchNumber}, ${coa.labName}, purity ${coa.purity ?? "n/a"}%`
      : "No lab reports on file for this item.",
  );

  // Step 2: quote shipping BEFORE creating the order, so you know the flat
  // rate and whether we serve the destination at all. Partner shipping has no
  // free-shipping threshold: the rate is always added on top of the net total.
  console.log(`Quoting shipping to ${shipTo.country}...`);
  const quote = await client.getShippingQuote(shipTo.country);
  if (!quote.shippable) {
    console.error(`We do not ship to ${quote.country}, aborting.`);
    process.exit(1);
  }
  console.log(
    `Shipping to ${quote.country} (zone ${quote.zone}): ${quote.currency} ${quote.rate}`,
  );

  // Step 3: create the order. partnerOrderRef is your own reference and your
  // idempotency key - re-sending the same ref later returns the existing order
  // instead of creating a duplicate. You never send prices.
  const orderInput: CreatePartnerOrder = {
    partnerOrderRef: `example-${Date.now()}`,
    items: [{ sku: item.sku, qty: 1 }],
    shipTo,
    endCustomerEmail: "customer@example.com",
  };

  console.log("Creating order...");
  const order = await client.createOrder(orderInput);
  console.log(`Order ${order.orderNumber} created, status=${order.status}`);
  console.log(
    `Subtotal ${order.currency} ${order.subtotal} + shipping ${order.currency} ${order.shippingCost} = due ${order.currency} ${order.amountDue}`,
  );
  console.log("Payment instructions:", order.paymentInstructions);

  // Step 4 (opt-in): cancel instead of paying. Only possible while the order
  // is still pending and no payment has been reported - after that the API
  // answers ORDER_NOT_CANCELLABLE (HTTP 409). Cancelling releases the stock
  // that was reserved when the order was created.
  if (process.env.PARTNER_EXAMPLE_CANCEL === "1") {
    console.log("PARTNER_EXAMPLE_CANCEL=1, cancelling the order...");
    const cancelled = await client.cancelOrder(order.orderId);
    console.log(`Order ${order.orderNumber} status=${cancelled.status}, stock released.`);
    return;
  }
  console.log(
    "Skipping cancellation (set PARTNER_EXAMPLE_CANCEL=1 to cancel this order instead of paying).",
  );

  // Step 5: report payment. In a real integration you would only call this
  // once you have actually sent the SEPA transfer or crypto payment. It is a
  // self-report: an admin still verifies the money before the order moves on.
  const sepa = order.paymentInstructions.sepa;
  if (sepa.iban) {
    console.log("Reporting SEPA payment...");
    const payment = await client.reportPayment(order.orderId, {
      method: "sepa",
      reference: sepa.reference,
    });
    console.log(`Payment report accepted, status=${payment.status}`);
  } else {
    console.log("No SEPA instructions on this order, skipping payment report in this example.");
  }

  // Step 6: poll the order for its current status and tracking. There are
  // no webhooks - poll GET /orders/:id until the status you care about.
  console.log("Fetching order status...");
  const details = await client.getOrder(order.orderId);
  console.log(`Order ${details.orderNumber} status: ${details.status}`);
  console.log("Tracking:", details.tracking ?? "not shipped yet");
  console.log("Invoice URL:", details.invoiceUrl ?? "not available yet");
}

main().catch((err: unknown) => {
  if (err instanceof PartnerApiError) {
    console.error(`API error [${err.code}] (HTTP ${err.status}): ${err.message}`);
  } else {
    console.error("Unexpected error:", err);
  }
  process.exit(1);
});
