import creditConfig from '../config/credits.json' with { type: 'json' };
import { grant } from './credits.js';
import Stripe from 'stripe';
import { fail, authorize, audit, planFor, now } from './core.js';
export function testStripe(env) {
  fail(
    /^sk_test_/.test(env.STRIPE_SECRET_KEY || ''),
    503,
    'STRIPE_TEST_REQUIRED',
    'Stripe TEST no configurado; claves LIVE rechazadas',
  );
  return new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 1, timeout: 15000 });
}
export class Billing {
  constructor(store, env, client, packs = creditConfig.packs) {
    this.store = store;
    this.env = env;
    this.client = client;
    this.packs = packs;
  }
  stripe() {
    return this.client || testStripe(this.env);
  }
  priceMap() {
    let map;
    try {
      map = JSON.parse(this.env.STRIPE_PRICE_MAP_JSON || '{}');
    } catch {
      fail(false, 503, 'PRICE_CONFIG', 'Mapa Stripe inválido');
    }
    return map;
  }
  async checkout(orgId, user, plan) {
    fail(/^historical(19|49|149|299)$/.test(plan), 400, 'PLAN_INVALID', 'Plan de prueba inválido');
    const org = await this.store.get(orgId);
    authorize(org, user, ['owner']);
    const price = this.priceMap()[plan];
    fail(price, 503, 'PRICE_REQUIRED', 'Price TEST pendiente de configuración');
    const stripe = this.stripe();
    const verified = await stripe.prices.retrieve(price);
    fail(
      !verified.livemode &&
        verified.active &&
        verified.currency === 'eur' &&
        verified.type === 'recurring' &&
        verified.unit_amount === planFor(plan).historicalEUR * 100,
      503,
      'PRICE_INVALID',
      'Price incompatible con referencia histórica de prueba',
    );
    let customerId = org.subscription.customerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: user.email || undefined,
          metadata: { organizationId: orgId, firebaseUID: user.uid },
        },
        { idempotencyKey: `zenit-test-customer-${orgId}` },
      );
      fail(!customer.livemode, 503, 'LIVE_REJECTED', 'Cliente LIVE rechazado');
      customerId = customer.id;
      await this.store.transaction(orgId, (o) => {
        authorize(o, user, ['owner']);
        o.subscription.customerId = customerId;
        audit(o, user.uid, 'billing.customer_linked', customerId);
      });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: orgId,
      metadata: { organizationId: orgId },
      subscription_data: { metadata: { organizationId: orgId } },
      success_url: `${this.env.APP_ORIGIN}/?billing=returned`,
      cancel_url: `${this.env.APP_ORIGIN}/?billing=cancelled`,
    });
    return { url: session.url, mode: 'test' };
  }
  async topup(orgId, user, packId) {
    const org = await this.store.get(orgId);
    authorize(org, user, ['owner']);
    const pack = this.packs[packId];
    fail(
      pack && pack.enabled === true && Number.isSafeInteger(pack.credits) && pack.credits > 0,
      503,
      'PACK_NOT_APPROVED',
      'Paquetes de créditos todavía no configurados',
    );
    fail(org.subscription.customerId, 409, 'CUSTOMER_REQUIRED', 'Crea primero un cliente TEST');
    const stripe = this.stripe(),
      price = await stripe.prices.retrieve(pack.testPriceId);
    fail(
      price.livemode === false &&
        price.type === 'one_time' &&
        price.currency === 'eur' &&
        price.unit_amount === pack.amountCents,
      503,
      'PACK_PRICE_INVALID',
      'Price de paquete inválido',
    );
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: org.subscription.customerId,
      line_items: [{ price: pack.testPriceId, quantity: 1 }],
      metadata: { organizationId: orgId, packId },
      success_url: `${this.env.APP_ORIGIN}/?billing=returned`,
      cancel_url: `${this.env.APP_ORIGIN}/?billing=cancelled`,
    });
    return { url: session.url, mode: 'test' };
  }
  async fulfillTopup(event, orgId) {
    const session = await this.stripe().checkout.sessions.retrieve(event.data.object.id, {
      expand: ['line_items'],
    });
    fail(
      session.livemode === false &&
        session.metadata?.organizationId === orgId &&
        session.mode === 'payment' &&
        session.payment_status === 'paid',
      400,
      'TOPUP_INVALID',
      'Compra TEST no verificada',
    );
    const pack = this.packs[session.metadata.packId],
      org = await this.store.get(orgId);
    fail(
      pack?.enabled &&
        session.customer === org.subscription.customerId &&
        session.amount_total === pack.amountCents &&
        session.currency === 'eur' &&
        session.line_items?.data?.length === 1 &&
        session.line_items.data[0].price.id === pack.testPriceId &&
        session.line_items.data[0].quantity === 1,
      400,
      'TOPUP_MAPPING',
      'Paquete/importe no coincidente',
    );
    return this.store.transaction(orgId, (o) => {
      o.creditPurchases ??= {};
      if (o.creditPurchases[session.id]) return { duplicate: true };
      fail(!o.subscription.billingHold, 409, 'BILLING_HOLD', 'Cuenta en revisión');
      grant(o, 'purchased', pack.credits);
      o.creditPurchases[session.id] = {
        id: session.id,
        packId: session.metadata.packId,
        credits: pack.credits,
        amountCents: session.amount_total,
        mode: 'test',
        at: now(),
      };
      o.billingEvents[event.id] = { type: event.type, processedAt: now() };
      audit(o, 'stripe', 'credits.purchased_test', session.id, { credits: pack.credits });
      return { received: true };
    });
  }
  async portal(orgId, user) {
    const org = await this.store.get(orgId);
    authorize(org, user, ['owner']);
    fail(org.subscription.customerId, 409, 'CUSTOMER_REQUIRED', 'No existe cliente de prueba');
    return this.stripe().billingPortal.sessions.create({
      customer: org.subscription.customerId,
      return_url: this.env.APP_ORIGIN,
    });
  }
  async webhook(raw, signature) {
    fail(this.env.STRIPE_WEBHOOK_SECRET, 503, 'WEBHOOK_CONFIG', 'Falta secreto webhook');
    let event;
    try {
      event = this.stripe().webhooks.constructEvent(
        raw,
        signature,
        this.env.STRIPE_WEBHOOK_SECRET,
        300,
      );
    } catch {
      fail(false, 400, 'WEBHOOK_SIGNATURE', 'Firma Stripe inválida');
    }
    return this.handle(event);
  }
  async handle(event) {
    fail(event.livemode === false, 400, 'LIVE_REJECTED', 'Eventos LIVE rechazados');
    const object = event.data?.object;
    let customer = typeof object.customer === 'string' ? object.customer : object.customer?.id;
    if (!customer && event.type?.startsWith('charge.dispute.') && object.charge) {
      const charge = await this.stripe().charges.retrieve(
        typeof object.charge === 'string' ? object.charge : object.charge.id,
      );
      fail(charge.livemode === false, 400, 'LIVE_REJECTED', 'Cargo LIVE rechazado');
      customer = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
    }
    if (!customer) return { ignored: true };
    const orgId = await this.store.findCustomer(customer);
    if (!orgId) return { ignored: true };
    const org = await this.store.get(orgId);
    if (org.billingEvents[event.id]) return { duplicate: true };
    if (event.type === 'checkout.session.completed' && object.mode === 'payment')
      return this.fulfillTopup(event, orgId);
    const types = [
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed',
      'charge.refunded',
      'charge.dispute.created',
      'charge.dispute.closed',
    ];
    if (!types.includes(event.type)) return { ignored: true };
    const isSub = event.type.startsWith('customer.subscription.');
    const subId = isSub
      ? object.id
      : object.parent?.subscription_details?.subscription ||
        object.subscription ||
        org.subscription.id;
    let sub = null,
      plan = null;
    if (subId) {
      sub = await this.stripe().subscriptions.retrieve(subId);
      fail(
        sub.livemode === false &&
          sub.customer === customer &&
          sub.metadata?.organizationId === orgId,
        400,
        'SUBSCRIPTION_MAPPING',
        'Suscripción no vinculada correctamente',
      );
      const priceId = sub.items?.data?.[0]?.price?.id;
      plan = Object.entries(this.priceMap()).find(([, price]) => price === priceId)?.[0];
      fail(plan, 400, 'PRICE_UNKNOWN', 'Price no reconocido');
    }
    return this.store.transaction(orgId, (o) => {
      if (o.billingEvents[event.id]) return { duplicate: true };
      fail(
        Object.keys(o.billingEvents).length < 500,
        409,
        'BILLING_CAPACITY',
        'Archivado de eventos requerido',
      );
      o.billingEvents[event.id] = { type: event.type, created: event.created, processedAt: now() };
      if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
        o.subscription.billingHold = true;
        for (const c of Object.values(o.commissions))
          if (c.customerId === customer) {
            c.status = 'held';
            c.reason = event.type;
          }
      }
      if (sub) {
        o.subscription = {
          ...o.subscription,
          id: sub.id,
          status: o.subscription.billingHold ? 'review_required' : sub.status,
          mode: 'test',
          periodEnd: sub.items?.data?.[0]?.current_period_end || null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        };
        o.plan = plan;
      }
      if (
        event.type === 'invoice.payment_failed' &&
        !o.subscription.billingHold &&
        sub?.status !== 'active'
      )
        o.subscription.status = 'past_due';
      if (event.type === 'invoice.paid' && object.paid === true && !o.invoices[object.id]) {
        o.invoices[object.id] = {
          id: object.id,
          amountPaid: object.amount_paid,
          currency: object.currency,
          at: now(),
          mode: 'test',
        };
        if (
          object.amount_paid > 0 &&
          !o.subscription.billingHold &&
          ['subscription_create', 'subscription_cycle'].includes(object.billing_reason)
        )
          grant(o, 'included', planFor(plan).initialCredits);
        const referral = Object.values(o.referrals).find((r) => r.customerId === customer);
        if (referral)
          o.commissions[object.id] = {
            id: object.id,
            invoiceId: object.id,
            customerId: customer,
            partnerId: referral.partnerId,
            rate: 0.2,
            baseNet: null,
            amount: null,
            status: 'pending_policy',
            mode: 'test',
            note: 'No se calcula ni paga hasta definir actividad, base neta y atribución',
          };
      }
      audit(o, 'stripe', 'billing.event', event.id, { type: event.type });
      return { received: true };
    });
  }
}
