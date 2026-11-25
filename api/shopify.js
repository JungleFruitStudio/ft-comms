// /api/shopify   the Shopify feed: customers become people in the registry, orders land on their timelines.
//
// POST  started every 15 minutes by the database's timer (header x-ftc-cron, a secret only the database knows), or by
//       an admin pressing "Sync now" in Settings. Takes what changed in Shopify since last time (customers, then
//       orders, oldest change first), hands it to the database (ftc_shopify_ingest matches people by Shopify id, then
//       email, then phone) and remembers how far it got. Also tells Shopify about anyone who unsubscribed here.
// GET   (signed in) says whether Shopify is connected and when the feed last ran.
//
// Env: SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET (an app made in Shopify's Dev Dashboard and installed on the store,
// scopes read_customers, read_orders, write_customers), SHOPIFY_SHOP (the store's myshopify.com address).
// Nothing is ever changed in Shopify except a customer's email marketing consent, and only to "unsubscribed".
const { person, rpc, send } = require('./_lib');
const SHOP = process.env.SHOPIFY_SHOP || 'foreigntongues.myshopify.com', API = '2026-10';
const ID = process.env.SHOPIFY_CLIENT_ID, SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const START = '2020-01-01T00:00:00Z', BUDGET_MS = 40e3;

let token = '', tokenExp = 0;
async function shopifyToken() {
  if (token && Date.now() < tokenExp - 60e3) return token;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: ID, client_secret: SECRET }) });
  if (!r.ok) throw new Error(`Shopify didn’t accept the app’s sign-in (${r.status}). Check the client id and secret, and that the app is installed on ${SHOP}.`);
  const j = await r.json(); token = j.access_token; tokenExp = Date.now() + (Number(j.expires_in) || 3600) * 1000; return token;
}
async function gql(query, variables) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await shopifyToken() }, body: JSON.stringify({ query, variables }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.errors && j.errors.length)) throw new Error('Shopify: ' + ((j.errors && j.errors[0] && j.errors[0].message) || r.status));
  return j.data;
}
const money = b => (b && b.shopMoney ? Number(b.shopMoney.amount).toFixed(2) : null);
const num = gid => String(gid || '').split('/').pop();
const addr = a => a ? [a.name, [a.address1, a.address2].filter(Boolean).join(' '), [a.city, [a.provinceCode, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), a.countryCodeV2].filter(Boolean).join('\n') : '';

const CUSTOMERS = `query($first: Int!, $after: String, $q: String!) { customers(first: $first, after: $after, sortKey: UPDATED_AT, query: $q) { pageInfo { hasNextPage endCursor }
  nodes { legacyResourceId firstName lastName createdAt updatedAt tags note numberOfOrders amountSpent { amount }
    defaultEmailAddress { emailAddress marketingState marketingUpdatedAt } defaultPhoneNumber { phoneNumber smsMarketingConsent { state } }
    defaultAddress { name address1 address2 city provinceCode zip countryCodeV2 } } } }`;
const ORDERS = `query($first: Int!, $after: String, $q: String!) { orders(first: $first, after: $after, sortKey: UPDATED_AT, query: $q) { pageInfo { hasNextPage endCursor }
  nodes { legacyResourceId name createdAt processedAt updatedAt cancelledAt test email phone note tags discountCodes displayFinancialStatus displayFulfillmentStatus
    customer { legacyResourceId } currencyCode
    subtotalPriceSet { shopMoney { amount } } totalShippingPriceSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } } totalDiscountsSet { shopMoney { amount } } totalPriceSet { shopMoney { amount } } totalRefundedSet { shopMoney { amount } }
    shippingLine { title } billingAddress { name address1 address2 city provinceCode zip countryCodeV2 phone } shippingAddress { name address1 address2 city provinceCode zip countryCodeV2 phone }
    lineItems(first: 50) { nodes { name title variantTitle sku quantity requiresShipping originalUnitPriceSet { shopMoney { amount } } product { legacyResourceId } } } } } }`;
const UNSUB = `mutation($input: CustomerEmailMarketingConsentUpdateInput!) { customerEmailMarketingConsentUpdate(input: $input) { userErrors { field message } } }`;

const customer = c => ({ id: String(c.legacyResourceId), first: c.firstName || '', last: c.lastName || '', email: (c.defaultEmailAddress && c.defaultEmailAddress.emailAddress) || '', phone: (c.defaultPhoneNumber && c.defaultPhoneNumber.phoneNumber) || '',
  created_at: c.createdAt, updated_at: c.updatedAt, tags: c.tags || [], note: c.note || '', orders: Number(c.numberOfOrders) || 0, spent: c.amountSpent ? Number(c.amountSpent.amount).toFixed(2) : '0.00',
  email_state: (c.defaultEmailAddress && c.defaultEmailAddress.marketingState) || '', email_at: (c.defaultEmailAddress && c.defaultEmailAddress.marketingUpdatedAt) || null,
  sms_state: (c.defaultPhoneNumber && c.defaultPhoneNumber.smsMarketingConsent && c.defaultPhoneNumber.smsMarketingConsent.state) || '', city: (c.defaultAddress && c.defaultAddress.city) || '', address: addr(c.defaultAddress) });
const order = o => ({ id: String(o.legacyResourceId), name: o.name, at: o.processedAt || o.createdAt, updated_at: o.updatedAt, cancelled_at: o.cancelledAt || null, test: !!o.test, email: o.email || '', phone: o.phone || (o.billingAddress && o.billingAddress.phone) || '',
  customer_id: o.customer ? String(o.customer.legacyResourceId) : '', fin: o.displayFinancialStatus || '', ful: o.displayFulfillmentStatus || '', currency: o.currencyCode,
  subtotal: money(o.subtotalPriceSet), shipping: money(o.totalShippingPriceSet), tax: money(o.totalTaxSet), discount: money(o.totalDiscountsSet), total: money(o.totalPriceSet), refunded: money(o.totalRefundedSet),
  method: (o.shippingLine && o.shippingLine.title) || '', discount_codes: o.discountCodes || [], note: o.note || '', tags: o.tags || [], billing_name: (o.billingAddress && o.billingAddress.name) || '',
  billing: o.billingAddress || null, shipping_address: o.shippingAddress || null,
  items: ((o.lineItems && o.lineItems.nodes) || []).map(i => ({ name: i.name, title: i.title, variant: i.variantTitle || '', sku: i.sku || '', qty: i.quantity, price: money(i.originalUnitPriceSet), requires_shipping: !!i.requiresShipping, product_id: i.product ? String(i.product.legacyResourceId) : '' })) });

module.exports = async (req, res) => {
  const cron = String(req.headers['x-ftc-cron'] || '');
  let key = '', who = null;
  if (cron) { let ok = false; try { ok = (await rpc('ftc_cron_ok', { s: cron })) === true; } catch (e) {} if (!ok) return send(res, 401, { error: 'Not allowed.' }); key = cron; }
  else { who = await person(req); if (!who) return send(res, 401, { error: 'Sign in again.' }); }
  const ready = !!(ID && SECRET);
  // the database's functions take the timer's secret, or the signed-in admin's own session
  const call = (name, args) => rpc(name, { s: key || null, ...args }, key ? undefined : who.token);
  try {
    if (req.method === 'GET') { let st = {}; try { st = await call('ftc_shopify_state', {}); } catch (e) {} return send(res, 200, { ready, shop: SHOP, last_run: st.last_run || null, last_result: st.last_result || null, last_error: st.last_error || null }); }
    if (req.method !== 'POST') return send(res, 405, { error: 'Not allowed.' });
    if (who && who.role !== 'admin') return send(res, 403, { error: 'Only admins can run the Shopify feed.' });
    if (!ready) return send(res, 200, { ready: false, note: 'Shopify isn’t connected yet.' });
    const started = Date.now(), left = () => BUDGET_MS - (Date.now() - started), st = await call('ftc_shopify_state', {}), total = { customers: 0, orders: 0, new_people: 0, unsubscribed: 0 };
    let since = { customers: st.customers_since || START, orders: st.orders_since || START }, error = '';
    try {
      // customers first, so an order finds its buyer; a page at a time, oldest change first, remembering how far it got
      for (const kind of ['customers', 'orders']) {
        let after = null, more = true;
        while (more && left() > 8e3) {
          const d = await gql(kind === 'customers' ? CUSTOMERS : ORDERS, { first: kind === 'customers' ? 100 : 50, after, q: `updated_at:>='${since[kind]}'` }), page = d[kind];
          const rows = page.nodes.map(kind === 'customers' ? customer : order);
          more = page.pageInfo.hasNextPage; after = page.pageInfo.endCursor;
          if (!rows.length) break;
          const upto = rows[rows.length - 1].updated_at;
          // (only move the bookmark when the whole list has been read, or a later page could be skipped: changes that share one timestamp)
          const r = await call('ftc_shopify_ingest', { customers: kind === 'customers' ? rows : [], orders: kind === 'orders' ? rows : [], state: more ? {} : { [kind + '_since']: upto } });
          total.customers += r.customers || 0; total.orders += r.orders || 0; total.new_people += r.new_people || 0;
        }
      }
      // people who unsubscribed here and are still subscribed in Shopify: tell Shopify (the only thing ever written there)
      for (const sid of (st.unsubscribed || [])) { if (left() < 4e3) break;
        const d = await gql(UNSUB, { input: { customerId: `gid://shopify/Customer/${sid}`, emailMarketingConsent: { marketingState: 'UNSUBSCRIBED', consentUpdatedAt: new Date().toISOString() } } });
        const errs = d.customerEmailMarketingConsentUpdate.userErrors; if (errs && errs.length) throw new Error('Shopify wouldn’t unsubscribe a customer: ' + errs[0].message); total.unsubscribed++; }
    } catch (e) { error = e.message || String(e); }
    await call('ftc_shopify_ingest', { customers: [], orders: [], state: { last_run: new Date().toISOString(), last_result: total, last_error: error || null } });
    return send(res, error ? 502 : 200, error ? { error, ...total } : { ok: true, ...total });
  } catch (e) { return send(res, 500, { error: e.message || String(e) }); }
};
