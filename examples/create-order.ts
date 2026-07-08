/**
 * End-to-end example: browse the catalog, place an order, pay it and poll
 * for its status. Run with:
 *
 *   PARTNER_API_KEY=pk_live_xxx npm run example
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
  console.log(`Selected item: ${item.sku} (${item.productName}, net €${item.netPrice})`);

  // Step 2: create an order. A sample EU shipping address and a
  // partnerOrderRef of your own choosing - re-sending the same ref later
  // returns the existing order instead of creating a duplicate.
  const shipTo: Address = {
    firstName: "Anna",
    lastName: "Muster",
    street: "Musterstrasse 12",
    city: "Berlin",
    postalCode: "10115",
    country: "DE",
    phone: "+49 30 1234567",
  };

  const orderInput: CreatePartnerOrder = {
    partnerOrderRef: `example-${Date.now()}`,
    items: [{ sku: item.sku, qty: 1 }],
    shipTo,
    endCustomerEmail: "customer@example.com",
  };

  console.log("Creating order...");
  const order = await client.createOrder(orderInput);
  console.log(`Order ${order.orderNumber} created, status=${order.status}`);
  console.log(`Amount due: €${order.amountDue}`);
  console.log("Payment instructions:", order.paymentInstructions);

  // Step 3: report payment. In a real integration you would only call this
  // once you have actually sent the SEPA transfer or crypto payment.
  const sepa = order.paymentInstructions.sepa;
  if (sepa) {
    console.log("Reporting SEPA payment...");
    const payment = await client.reportPayment(order.orderId, {
      method: "sepa",
      reference: sepa.reference,
    });
    console.log(`Payment report accepted, status=${payment.status}`);
  } else {
    console.log("No SEPA instructions on this order, skipping payment report in this example.");
  }

  // Step 4: poll the order for its current status and tracking. There are
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
