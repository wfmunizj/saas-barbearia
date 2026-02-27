/**
 * server/clientRouter.ts
 * Endpoints públicos do portal do cliente
 * Montado em /api/trpc (via appRouter) com procedures públicas e protegidas por clientUser
 */

import { router, publicProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  barbershops, plans, clientUsers, subscriptions,
  appointments, clients, barbers, services,
} from "../drizzle/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { verifyClientSession } from "./clientAuth";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-10-29.clover" });

// ─── Helper: autenticar clientUser via cookie ─────────────────────────────────

async function getClientUser(req: any) {
  const clientUser = await verifyClientSession(req);
  if (!clientUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Faça login para continuar" });
  return clientUser;
}

// ─── Router público ───────────────────────────────────────────────────────────

export const clientPortalRouter = router({

  // Dados públicos da barbearia (sem auth)
  getBarbershop: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [barbershop] = await db
        .select({
          id: barbershops.id,
          name: barbershops.name,
          slug: barbershops.slug,
          phone: barbershops.phone,
          address: barbershops.address,
          logoUrl: barbershops.logoUrl,
        })
        .from(barbershops)
        .where(and(eq(barbershops.slug, input.slug), eq(barbershops.isActive, true)))
        .limit(1);

      if (!barbershop) throw new TRPCError({ code: "NOT_FOUND", message: "Barbearia não encontrada" });
      return barbershop;
    }),

  // Planos disponíveis da barbearia
  getPlans: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [barbershop] = await db.select({ id: barbershops.id })
        .from(barbershops).where(eq(barbershops.slug, input.slug)).limit(1);
      if (!barbershop) throw new TRPCError({ code: "NOT_FOUND" });

      return db.select().from(plans).where(
        and(eq(plans.barbershopId, barbershop.id), eq(plans.isActive, true))
      );
    }),

  // Barbeiros ativos da barbearia
  getBarbers: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [barbershop] = await db.select({ id: barbershops.id })
        .from(barbershops).where(eq(barbershops.slug, input.slug)).limit(1);
      if (!barbershop) throw new TRPCError({ code: "NOT_FOUND" });

      return db.select({
        id: barbers.id,
        name: barbers.name,
        specialties: barbers.specialties,
      }).from(barbers).where(
        and(eq(barbers.barbershopId, barbershop.id), eq(barbers.isActive, true))
      );
    }),

  // Serviços ativos da barbearia
  getServices: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [barbershop] = await db.select({ id: barbershops.id })
        .from(barbershops).where(eq(barbershops.slug, input.slug)).limit(1);
      if (!barbershop) throw new TRPCError({ code: "NOT_FOUND" });

      return db.select().from(services).where(
        and(eq(services.barbershopId, barbershop.id), eq(services.isActive, true))
      );
    }),

  // Horários disponíveis de um barbeiro numa data
  getAvailableSlots: publicProcedure
    .input(z.object({
      slug: z.string(),
      barberId: z.number(),
      date: z.string(), // "2026-03-01"
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startOfDay = new Date(`${input.date}T00:00:00-03:00`);
      const endOfDay   = new Date(`${input.date}T23:59:59-03:00`);

      const existing = await db.select({ appointmentDate: appointments.appointmentDate })
        .from(appointments)
        .where(
          and(
            eq(appointments.barberId, input.barberId),
            gte(appointments.appointmentDate, startOfDay),
            lte(appointments.appointmentDate, endOfDay), 
          )
        );

      const bookedTimes = new Set(
        existing.map(a => new Date(a.appointmentDate).toTimeString().slice(0, 5))
      );

      // Gera slots de 30 em 30 minutos das 08:00 às 18:00
      const slots: { time: string; available: boolean }[] = [];
      for (let hour = 8; hour < 18; hour++) {
        for (const min of [0, 30]) {
          const time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
          slots.push({ time, available: !bookedTimes.has(time) });
        }
      }

      return slots;
    }),

  // ─── Endpoints autenticados (requerem clientUser logado) ─────────────────────

  // Minha conta
  me: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const clientUser = await verifyClientSession((ctx as any).req);
      if (!clientUser) return null;

      const db = await getDb();
      if (!db) return null;

      const [sub] = await db
        .select({ subscription: subscriptions, plan: plans })
        .from(subscriptions)
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .where(and(
          eq(subscriptions.clientUserId, clientUser.id),
          eq(subscriptions.status, "active")
        ))
        .limit(1);

      // Agendamentos futuros
      const upcoming = await db.select({
        id: appointments.id,
        appointmentDate: appointments.appointmentDate,
        status: appointments.status,
        barberName: barbers.name,
        serviceName: services.name,
      })
        .from(appointments)
        .innerJoin(barbers, eq(appointments.barberId, barbers.id))
        .innerJoin(services, eq(appointments.serviceId, services.id))
        .where(
          and(
            eq(appointments.clientId, clientUser.clientId!),
            gte(appointments.appointmentDate, new Date())
          )
        );

      return {
        user: { id: clientUser.id, name: clientUser.name, email: clientUser.email, phone: clientUser.phone },
        subscription: sub ?? null,
        upcomingAppointments: upcoming,
      };
    }),

  // Agendar (requer assinatura ativa ou pagamento avulso)
  bookAppointment: publicProcedure
    .input(z.object({
      slug: z.string(),
      barberId: z.number(),
      serviceId: z.number(),
      appointmentDate: z.union([z.string(), z.date()]).transform(v => new Date(v)),
      notes: z.string().optional(),
      useSubscriptionCredit: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const clientUser = await getClientUser((ctx as any).req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [barbershop] = await db.select({ id: barbershops.id })
        .from(barbershops).where(eq(barbershops.slug, input.slug)).limit(1);
      if (!barbershop) throw new TRPCError({ code: "NOT_FOUND" });

      // Verifica créditos se for usar assinatura
      if (input.useSubscriptionCredit) {
        const [sub] = await db.select().from(subscriptions).where(
          and(
            eq(subscriptions.clientUserId, clientUser.id),
            eq(subscriptions.status, "active")
          )
        ).limit(1);

        if (!sub || sub.creditsRemaining <= 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Sem créditos disponíveis. Assine um plano ou aguarde a renovação mensal.",
          });
        }

        // Cria o agendamento
        const [appointment] = await db.insert(appointments).values({
          barbershopId: barbershop.id,
          clientId: clientUser.clientId!,
          barberId: input.barberId,
          serviceId: input.serviceId,
          appointmentDate: input.appointmentDate,
          notes: input.notes,
          status: "confirmed",
        }).returning();

        // Debita 1 crédito
        await db.update(subscriptions)
          .set({ creditsRemaining: sub.creditsRemaining - 1, updatedAt: new Date() })
          .where(eq(subscriptions.id, sub.id));

        return { appointment, creditsRemaining: sub.creditsRemaining - 1 };
      }

      // Sem crédito (agendamento avulso — status pending até pagamento)
      const [appointment] = await db.insert(appointments).values({
        barbershopId: barbershop.id,
        clientId: clientUser.clientId!,
        barberId: input.barberId,
        serviceId: input.serviceId,
        appointmentDate: input.appointmentDate,
        notes: input.notes,
        status: "pending",
      }).returning();

      return { appointment, creditsRemaining: 0 };
    }),

  // Criar sessão de checkout Stripe para assinar plano
  createSubscriptionCheckout: publicProcedure
    .input(z.object({
      slug: z.string(),
      planId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const clientUser = await getClientUser((ctx as any).req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [barbershop] = await db.select().from(barbershops)
        .where(eq(barbershops.slug, input.slug)).limit(1);
      if (!barbershop) throw new TRPCError({ code: "NOT_FOUND" });

      const [plan] = await db.select().from(plans)
        .where(and(eq(plans.id, input.planId), eq(plans.isActive, true))).limit(1);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado" });

      if (!plan.stripePriceId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Plano sem preço configurado no Stripe" });
      }

      // Cria ou reutiliza customer no Stripe
      let stripeCustomerId = clientUser.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: clientUser.email,
          name: clientUser.name ?? undefined,
          metadata: { clientUserId: clientUser.id.toString(), barbershopId: barbershop.id.toString() },
        });
        stripeCustomerId = customer.id;
        await db.update(clientUsers)
          .set({ stripeCustomerId, updatedAt: new Date() })
          .where(eq(clientUsers.id, clientUser.id));
      }

      const origin = (ctx as any).req.headers.origin ?? `http://localhost:3000`;
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        success_url: `${origin}/b/${input.slug}/minha-conta?subscription=success`,
        cancel_url: `${origin}/b/${input.slug}?subscription=cancelled`,
        metadata: {
          client_user_id: clientUser.id.toString(),
          plan_id: plan.id.toString(),
          barbershop_id: barbershop.id.toString(),
        },
      });

      return { checkoutUrl: session.url };
    }),

  // Cancelar assinatura
  cancelSubscription: publicProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx }) => {
      const clientUser = await getClientUser((ctx as any).req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [sub] = await db.select().from(subscriptions).where(
        and(eq(subscriptions.clientUserId, clientUser.id), eq(subscriptions.status, "active"))
      ).limit(1);

      if (!sub?.stripeSubscriptionId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma assinatura ativa encontrada" });
      }

      await stripe.subscriptions.cancel(sub.stripeSubscriptionId);

      await db.update(subscriptions).set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, sub.id));

      return { success: true };
    }),
});
