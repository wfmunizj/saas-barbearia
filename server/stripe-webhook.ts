import { Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "./db";
import { payments, subscriptions, clientUsers, plans, appointments } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

export async function handleStripeWebhook(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    console.error("[Webhook] Missing stripe-signature header");
    return res.status(400).send("Missing signature");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("[Webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.id.startsWith("evt_test_")) {
    console.log("[Webhook] Test event detected");
    return res.json({ verified: true });
  }

  console.log(`[Webhook] Received: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(
          event.data.object as Stripe.Subscription
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(
          event.data.object as Stripe.Invoice
        );
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent
        );
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(
          event.data.object as Stripe.PaymentIntent
        );
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        // Verifica se é assinatura SaaS ou de cliente da barbearia
        const subMeta =
          (event.data.object as Stripe.Subscription).metadata ?? {};
        if (subMeta.barbershopId && subMeta.saasPlanId) {
          await handleSaasSubscriptionUpsert(
            event.data.object as Stripe.Subscription
          );
        } else {
          await handleSubscriptionUpsert(
            event.data.object as Stripe.Subscription
          ); // sua função existente
        }
        break;

      case "customer.subscription.deleted":
        const delMeta =
          (event.data.object as Stripe.Subscription).metadata ?? {};
        if (delMeta.barbershopId && delMeta.saasPlanId) {
          await handleSaasSubscriptionDeleted(
            event.data.object as Stripe.Subscription
          );
        } else {
          await handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription
          ); // sua função existente
        }
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("[Webhook] Error processing event:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}

// ─── checkout.session.completed ───────────────────────────────────────────────
// Pagamentos avulsos (sem planId no metadata). Assinaturas são tratadas pelo
// customer.subscription.created que o Stripe dispara logo em seguida.

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  console.log("[Webhook] checkout.session.completed:", session.id);

  const db = await getDb();
  if (!db) return;

  const metadata = session.metadata || {};
  const planId = metadata.plan_id;

  // Se for checkout de assinatura, não registra pagamento aqui —
  // isso será feito em invoice.payment_succeeded
  if (planId) {
    console.log(
      "[Webhook] Subscription checkout — payment will be recorded via invoice event"
    );
    return;
  }

  // Pagamento avulso
  const clientId = metadata.client_id ? parseInt(metadata.client_id) : null;
  const barbershopId = metadata.barbershop_id
    ? parseInt(metadata.barbershop_id)
    : null;
  const appointmentId = metadata.appointment_id
    ? parseInt(metadata.appointment_id)
    : null;

  if (!clientId || !barbershopId) {
    console.error("[Webhook] Missing client_id or barbershop_id in metadata");
    return;
  }

  // Determine payment method — session.payment_method_types is null when
  // automatic_payment_methods is enabled; fall back to checking payment_method_options
  const pmType = session.payment_method_types?.[0]
    ?? (session.payment_method_options?.pix ? "pix" : "card");

  await db.insert(payments).values({
    appointmentId,
    clientId,
    barbershopId,
    amountInCents: session.amount_total || 0,
    status: "completed",
    paymentMethod: pmType,
    stripePaymentIntentId: (session.payment_intent as string) ?? undefined,
    stripeSessionId: session.id,
  });

  console.log("[Webhook] One-time payment recorded for client:", clientId);

  // Confirmar agendamento se appointment_id estiver no metadata
  if (appointmentId) {
    await db.update(appointments)
      .set({ status: "confirmed", updatedAt: new Date() })
      .where(eq(appointments.id, appointmentId));
    console.log("[Webhook] Appointment confirmed via Stripe payment:", appointmentId);
  }
}

// ─── customer.subscription.created / updated ─────────────────────────────────
// Ativa ou atualiza a assinatura no banco. Também renova créditos quando
// o período muda (renovação mensal).

async function handleSubscriptionUpsert(stripeSub: Stripe.Subscription) {
  console.log(
    "[Webhook] subscription upsert:",
    stripeSub.id,
    "status:",
    stripeSub.status
  );

  const db = await getDb();
  if (!db) return;

  const customerId = stripeSub.customer as string;
  const [clientUser] = await db
    .select()
    .from(clientUsers)
    .where(eq(clientUsers.stripeCustomerId, customerId))
    .limit(1);

  if (!clientUser) {
    console.error("[Webhook] ClientUser not found for customer:", customerId);
    return;
  }

  const priceId = stripeSub.items.data[0]?.price?.id;
  if (!priceId) {
    console.error("[Webhook] No priceId in subscription:", stripeSub.id);
    return;
  }

  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.stripePriceId, priceId))
    .limit(1);

  if (!plan) {
    console.error("[Webhook] Plan not found for priceId:", priceId);
    return;
  }

  // ✅ Converte os timestamps com segurança
  const periodStart = (stripeSub as any).current_period_start;
  const periodEnd = (stripeSub as any).current_period_end;
  const currentPeriodStart =
    periodStart && periodStart > 0 ? new Date(periodStart * 1000) : null;
  const currentPeriodEnd =
    periodEnd && periodEnd > 0 ? new Date(periodEnd * 1000) : null;

  const mappedStatus: "active" | "cancelled" | "past_due" | "trialing" =
    stripeSub.status === "active"
      ? "active"
      : stripeSub.status === "past_due"
        ? "past_due"
        : stripeSub.status === "trialing"
          ? "trialing"
          : "cancelled";

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clientUserId, clientUser.id))
    .limit(1);

  if (existing) {
    const isNewSubscription = existing.stripeSubscriptionId !== stripeSub.id;

    const isRenewal =
      !isNewSubscription &&
      existing.currentPeriodStart !== null &&
      currentPeriodStart !== null &&
      currentPeriodStart.getTime() >
        new Date(existing.currentPeriodStart).getTime();

    const shouldResetCredits = isNewSubscription || isRenewal;

    await db
      .update(subscriptions)
      .set({
        planId: plan.id,
        barbershopId: plan.barbershopId,
        status: mappedStatus,
        stripeSubscriptionId: stripeSub.id,
        ...(currentPeriodStart && { currentPeriodStart }),
        ...(currentPeriodEnd && { currentPeriodEnd }),
        creditsRemaining: shouldResetCredits
          ? plan.creditsPerMonth
          : existing.creditsRemaining,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existing.id));

    console.log(
      `[Webhook] Subscription updated (renewal=${isRenewal}, newSub=${isNewSubscription}) for clientUser:`,
      clientUser.id
    );
  } else {
    await db.insert(subscriptions).values({
      clientUserId: clientUser.id,
      planId: plan.id,
      barbershopId: plan.barbershopId,
      status: mappedStatus,
      stripeSubscriptionId: stripeSub.id,
      creditsRemaining: plan.creditsPerMonth,
      ...(currentPeriodStart && { currentPeriodStart }),
      ...(currentPeriodEnd && { currentPeriodEnd }),
    });

    console.log(
      "[Webhook] Subscription created for clientUser:",
      clientUser.id
    );
  }
}

// ─── customer.subscription.deleted ───────────────────────────────────────────

async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription) {
  console.log("[Webhook] subscription deleted:", stripeSub.id);

  const db = await getDb();
  if (!db) return;

  await db
    .update(subscriptions)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id));

  console.log("[Webhook] Subscription cancelled:", stripeSub.id);
}

// ─── invoice.payment_succeeded ────────────────────────────────────────────────
// Disparado em toda cobrança de assinatura bem-sucedida (inclusive a primeira).
// Registra o pagamento no histórico financeiro da barbearia.
// onConflictDoNothing garante idempotência — requer unique(stripe_session_id) no schema.

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log("[Webhook] invoice.payment_succeeded:", invoice.id);

  const db = await getDb();
  if (!db) return;

  const customerId = invoice.customer as string;
  const [clientUser] = await db
    .select()
    .from(clientUsers)
    .where(eq(clientUsers.stripeCustomerId, customerId))
    .limit(1);

  if (!clientUser?.clientId) {
    console.warn(
      "[Webhook] ClientUser or clientId not found for customer:",
      customerId
    );
    return;
  }

  // ✅ Busca barbershopId — se não achar, não registra pagamento (evita FK violation)
  const [sub] = await db
    .select({ barbershopId: subscriptions.barbershopId })
    .from(subscriptions)
    .where(eq(subscriptions.clientUserId, clientUser.id))
    .limit(1);

  if (!sub?.barbershopId) {
    console.warn(
      "[Webhook] No active subscription found yet for clientUser:",
      clientUser.id,
      "— skipping payment record"
    );
    return;
  }

  const paymentIntentId =
    typeof (invoice as any).payment_intent === "string"
      ? ((invoice as any).payment_intent as string)
      : undefined;

  await db
    .insert(payments)
    .values({
      clientId: clientUser.clientId,
      barbershopId: sub.barbershopId,
      amountInCents: invoice.amount_paid,
      status: "completed",
      paymentMethod: "card",
      ...(paymentIntentId && { stripePaymentIntentId: paymentIntentId }),
      stripeSessionId: invoice.id,
    })
    .onConflictDoNothing();

  console.log(
    "[Webhook] Invoice payment recorded for client:",
    clientUser.clientId
  );
}

// ─── invoice.payment_failed ───────────────────────────────────────────────────

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log("[Webhook] invoice.payment_failed:", invoice.id);

  const db = await getDb();
  if (!db) return;

  const customerId = invoice.customer as string;
  const [clientUser] = await db
    .select()
    .from(clientUsers)
    .where(eq(clientUsers.stripeCustomerId, customerId))
    .limit(1);

  if (!clientUser) return;

  await db
    .update(subscriptions)
    .set({
      status: "past_due",
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.clientUserId, clientUser.id));

  console.log(
    "[Webhook] Subscription marked as past_due for clientUser:",
    clientUser.id
  );
}

// ─── payment_intent.succeeded ─────────────────────────────────────────────────

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent
) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(payments)
    .set({
      status: "completed",
    })
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id));
}

// ─── payment_intent.payment_failed ────────────────────────────────────────────

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(payments)
    .set({
      status: "failed",
    })
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id));
}

// ─── SaaS: customer.subscription.created / updated ────────────────────────────
async function handleSaasSubscriptionUpsert(stripeSub: Stripe.Subscription) {
  const metadata = stripeSub.metadata ?? {};
  const barbershopId = metadata.barbershopId ? parseInt(metadata.barbershopId) : null;
  const saasPlanId = metadata.saasPlanId ? parseInt(metadata.saasPlanId) : null;
  if (!barbershopId || !saasPlanId) return;

  const db = await getDb();
  if (!db) return;

  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "cancelled",
    incomplete: "past_due",
    incomplete_expired: "expired",
  };
  const status = statusMap[stripeSub.status] ?? "cancelled";

  const periodStart = (stripeSub as any).current_period_start;
  const periodEnd = (stripeSub as any).current_period_end;
  const startStr = periodStart ? "'" + new Date(periodStart * 1000).toISOString() + "'" : "NULL";
  const endStr = periodEnd ? "'" + new Date(periodEnd * 1000).toISOString() + "'" : "NULL";

  await db.execute(
    ("UPDATE saas_subscriptions SET " +
    "saas_plan_id = " + saasPlanId + ", " +
    "stripe_subscription_id = '" + stripeSub.id + "', " +
    "stripe_customer_id = '" + (stripeSub.customer as string) + "', " +
    "status = '" + status + "', " +
    "current_period_start = " + startStr + ", " +
    "current_period_end = " + endStr + ", " +
    "updated_at = NOW() " +
    "WHERE barbershop_id = " + barbershopId) as any
  );

  console.log("[SaasWebhook] Subscription upserted — barbershop:", barbershopId, "status:", status);
}

// ─── SaaS: customer.subscription.deleted ─────────────────────────────────────
async function handleSaasSubscriptionDeleted(stripeSub: Stripe.Subscription) {
  const db = await getDb();
  if (!db) return;

  await db.execute(
    ("UPDATE saas_subscriptions SET " +
    "status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() " +
    "WHERE stripe_subscription_id = '" + stripeSub.id + "'") as any
  );

  console.log("[SaasWebhook] Subscription cancelled:", stripeSub.id);
}