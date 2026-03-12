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
  barberCommissionRecords, appointmentServices,
} from "../drizzle/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { verifyClientSession } from "./clientAuth";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN!;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

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
          primaryColor: barbershops.primaryColor,
          secondaryColor: barbershops.secondaryColor,
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
        serviceName: sql<string>`string_agg(${services.name}, ', ' ORDER BY ${services.name})`,
      })
        .from(appointments)
        .innerJoin(barbers, eq(appointments.barberId, barbers.id))
        .leftJoin(appointmentServices, eq(appointmentServices.appointmentId, appointments.id))
        .leftJoin(services, sql`${services.id} = COALESCE(${appointmentServices.serviceId}, ${appointments.serviceId})`)
        .where(
          and(
            eq(appointments.clientId, clientUser.clientId!),
            gte(appointments.appointmentDate, new Date())
          )
        )
        .groupBy(appointments.id, barbers.id);

      return {
        user: { id: clientUser.id, name: clientUser.name, email: clientUser.email, phone: clientUser.phone },
        subscription: sub ?? null,
        upcomingAppointments: upcoming,
      };
    }),

  // Agendar (com assinatura ativa, guest booking, ou pagamento avulso)
  bookAppointment: publicProcedure
    .input(z.object({
      slug: z.string(),
      barberId: z.number(),
      serviceIds: z.array(z.number()).min(1),
      appointmentDate: z.union([z.string(), z.date()]).transform(v => new Date(v)),
      notes: z.string().optional(),
      useSubscriptionCredit: z.boolean().default(true),
      // Exceção pai/filho: agendamento em nome de outra pessoa
      isGuestBooking: z.boolean().default(false),
      guestName: z.string().optional(),
      // Pagamento avulso: in_person (confirma direto) ou mp (Checkout Pro MP)
      paymentMethod: z.enum(["in_person", "mp"]).default("in_person"),
    }))
    .mutation(async ({ ctx, input }) => {
      const clientUser = await getClientUser((ctx as any).req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [barbershop] = await db.select({ id: barbershops.id, mpAccessToken: barbershops.mpAccessToken })
        .from(barbershops).where(eq(barbershops.slug, input.slug)).limit(1);
      if (!barbershop) throw new TRPCError({ code: "NOT_FOUND" });

      // Validação: guest booking requer nome do convidado
      if (input.isGuestBooking && !input.guestName?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe o nome da pessoa para quem está agendando.",
        });
      }

      // Busca todos os serviços selecionados e calcula totais
      const selectedServices = await db
        .select({ id: services.id, name: services.name, priceInCents: services.priceInCents, durationMinutes: services.durationMinutes, fichasCount: services.fichasCount, fichaValueInCents: services.fichaValueInCents })
        .from(services)
        .where(and(inArray(services.id, input.serviceIds), eq(services.barbershopId, barbershop.id), eq(services.isActive, true)));

      if (selectedServices.length !== input.serviceIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Serviço inválido" });
      }

      const totalPrice = selectedServices.reduce((sum, s) => sum + s.priceInCents, 0);

      // ── Agendamento com crédito de assinatura ─────────────────────────────
      if (input.useSubscriptionCredit && !input.isGuestBooking) {
        const [sub] = await db.select({ id: subscriptions.id, creditsRemaining: subscriptions.creditsRemaining, planId: subscriptions.planId, primaryBarberId: subscriptions.primaryBarberId })
          .from(subscriptions).where(
            and(
              eq(subscriptions.clientUserId, clientUser.id),
              eq(subscriptions.status, "active")
            )
          ).limit(1);

        if (!sub) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Sem assinatura ativa. Assine um plano para continuar.",
          });
        }

        // Busca plano para verificar se é ilimitado e dias permitidos
        const [plan] = await db.select({
          isUnlimited: plans.isUnlimited,
          creditsRemaining: subscriptions.creditsRemaining,
          allowedDaysOfWeek: plans.allowedDaysOfWeek,
        })
          .from(plans)
          .innerJoin(subscriptions, eq(subscriptions.planId, plans.id))
          .where(eq(subscriptions.id, sub.id))
          .limit(1);

        // Verificação de dias permitidos
        if (plan?.allowedDaysOfWeek) {
          const allowed: number[] = JSON.parse(plan.allowedDaysOfWeek);
          const dayOfWeek = input.appointmentDate.getDay(); // 0=Dom, 1=Seg...
          if (!allowed.includes(dayOfWeek)) {
            const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
            const allowedNames = allowed.map(d => dayNames[d]).join(", ");
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Seu plano permite agendamentos apenas em: ${allowedNames}.`,
            });
          }
        }

        // Verificação de créditos (somente planos não-ilimitados)
        if (!plan?.isUnlimited && sub.creditsRemaining <= 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Sem créditos disponíveis. Aguarde a renovação mensal ou assine um plano ilimitado.",
          });
        }

        // Determina barbeiro principal: usa o da assinatura ou registra o atual como principal
        const resolvedPrimaryBarberId = sub.primaryBarberId ?? input.barberId;
        if (!sub.primaryBarberId) {
          await db.update(subscriptions)
            .set({ primaryBarberId: input.barberId, updatedAt: new Date() })
            .where(eq(subscriptions.id, sub.id));
        }

        // Cria o agendamento (atômico: appointment + appointmentServices)
        const [appointment] = await db.transaction(async (tx) => {
          const [appt] = await tx.insert(appointments).values({
            barbershopId: barbershop.id,
            clientId: clientUser.clientId!,
            barberId: input.barberId,
            serviceId: null,
            appointmentDate: input.appointmentDate,
            notes: input.notes,
            status: "confirmed",
            isGuestBooking: false,
            primaryBarberId: resolvedPrimaryBarberId,
          }).returning();

          await tx.insert(appointmentServices).values(
            selectedServices.map(s => ({
              appointmentId: appt.id,
              serviceId: s.id,
              priceInCents: s.priceInCents,
              durationMinutes: s.durationMinutes,
              fichasCount: s.fichasCount,
              fichaValueInCents: s.fichaValueInCents ?? 0,
            }))
          );

          return [appt];
        });

        // Debita 1 crédito apenas se plano não for ilimitado
        const newCredits = plan?.isUnlimited ? sub.creditsRemaining : sub.creditsRemaining - 1;
        if (!plan?.isUnlimited) {
          await db.update(subscriptions)
            .set({ creditsRemaining: newCredits, updatedAt: new Date() })
            .where(eq(subscriptions.id, sub.id));
        }

        return { appointment, creditsRemaining: newCredits };
      }

      // ── Agendamento em nome de outra pessoa (pai → filho) ─────────────────
      // NÃO debita crédito do titular
      if (input.isGuestBooking) {
        const [appointment] = await db.transaction(async (tx) => {
          const [appt] = await tx.insert(appointments).values({
            barbershopId: barbershop.id,
            clientId: clientUser.clientId!,
            barberId: input.barberId,
            serviceId: null,
            appointmentDate: input.appointmentDate,
            notes: input.notes ? `[Para: ${input.guestName}] ${input.notes}` : `Agendamento para: ${input.guestName}`,
            status: "confirmed",
            isGuestBooking: true,
            guestName: input.guestName,
          }).returning();

          await tx.insert(appointmentServices).values(
            selectedServices.map(s => ({
              appointmentId: appt.id,
              serviceId: s.id,
              priceInCents: s.priceInCents,
              durationMinutes: s.durationMinutes,
              fichasCount: s.fichasCount,
              fichaValueInCents: s.fichaValueInCents ?? 0,
            }))
          );

          return [appt];
        });

        // Busca créditos atuais para retornar no response
        const [sub] = await db.select({ creditsRemaining: subscriptions.creditsRemaining })
          .from(subscriptions).where(
            and(eq(subscriptions.clientUserId, clientUser.id), eq(subscriptions.status, "active"))
          ).limit(1);

        return { appointment, creditsRemaining: sub?.creditsRemaining ?? 0 };
      }

      // ── Agendamento avulso (sem assinatura) ────────────────────────────────
      // in_person: confirma direto; mp: gera Checkout Pro MP e retorna URL

      if (input.paymentMethod === "mp") {
        // Cria agendamento pendente — será confirmado pelo webhook após pagamento
        const [appointment] = await db.transaction(async (tx) => {
          const [appt] = await tx.insert(appointments).values({
            barbershopId: barbershop.id,
            clientId: clientUser.clientId!,
            barberId: input.barberId,
            serviceId: null,
            appointmentDate: input.appointmentDate,
            notes: input.notes,
            status: "pending",
            isGuestBooking: false,
          }).returning();

          await tx.insert(appointmentServices).values(
            selectedServices.map(s => ({
              appointmentId: appt.id,
              serviceId: s.id,
              priceInCents: s.priceInCents,
              durationMinutes: s.durationMinutes,
              fichasCount: s.fichasCount,
              fichaValueInCents: s.fichaValueInCents ?? 0,
            }))
          );

          return [appt];
        });

        const origin = (ctx as any).req.headers.origin ?? `http://localhost:3000`;

        // Usa access_token da barbearia se disponível (Marketplace), senão usa token da plataforma
        const accessToken = barbershop.mpAccessToken ?? MP_ACCESS_TOKEN;

        const preferenceBody = {
          items: [{
            title: `Agendamento — ${selectedServices.map(s => s.name).join(" + ")}`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: totalPrice / 100,
          }],
          back_urls: {
            success: `${origin}/b/${input.slug}/minha-conta?payment=success`,
            failure: `${origin}/b/${input.slug}/agendar?payment=cancelled`,
            pending: `${origin}/b/${input.slug}/minha-conta?payment=pending`,
          },
          auto_return: "approved",
          notification_url: `${BASE_URL}/api/mp/webhook`,
          external_reference: `appt:${appointment.id}`,
          metadata: {
            appointment_id: appointment.id.toString(),
            client_id: clientUser.clientId!.toString(),
            barbershop_id: barbershop.id.toString(),
          },
        };

        const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(preferenceBody),
        });

        if (!mpRes.ok) {
          const err = await mpRes.text();
          console.error("[BookAppointment] Erro MP Preference:", err);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar checkout de pagamento" });
        }

        const preference = await mpRes.json() as any;
        return { appointment, creditsRemaining: 0, checkoutUrl: preference.init_point };
      }

      // Pagamento na barbearia → confirma automaticamente (atômico: appointment + appointmentServices)
      const [appointment] = await db.transaction(async (tx) => {
        const [appt] = await tx.insert(appointments).values({
          barbershopId: barbershop.id,
          clientId: clientUser.clientId!,
          barberId: input.barberId,
          serviceId: null,
          appointmentDate: input.appointmentDate,
          notes: input.notes,
          status: "confirmed",
          isGuestBooking: false,
        }).returning();

        await tx.insert(appointmentServices).values(
          selectedServices.map(s => ({
            appointmentId: appt.id,
            serviceId: s.id,
            priceInCents: s.priceInCents,
            durationMinutes: s.durationMinutes,
            fichasCount: s.fichasCount,
            fichaValueInCents: s.fichaValueInCents ?? 0,
          }))
        );

        return [appt];
      });

      return { appointment, creditsRemaining: 0, checkoutUrl: null };
    }),

  // Criar checkout MP Preapproval para assinar plano
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

      const origin = (ctx as any).req.headers.origin ?? `http://localhost:3000`;
      const barbershopToken = barbershop.mpAccessToken ?? MP_ACCESS_TOKEN;

      if (plan.mpPreapprovalPlanId) {
        // Assinatura recorrente: redireciona direto para a página de checkout do plano MP.
        // Não chamamos POST /preapproval pois o MP exige card_token_id (tokenização de cartão
        // feita pelo pagador no lado deles). A URL abaixo é a página hospedada pelo MP onde
        // o cliente entra com os dados do cartão e confirma a assinatura.

        // Pré-criar assinatura como "pending" para o webhook identificar o cliente ao retornar.
        // O e-mail da conta MP pode ser diferente do e-mail cadastrado na plataforma,
        // então guardamos clientUserId aqui para o webhook encontrar depois.
        if (clientUser) {
          const [existingSub] = await db
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(eq(subscriptions.clientUserId, clientUser.id))
            .limit(1);

          if (existingSub) {
            await db
              .update(subscriptions)
              .set({ planId: plan.id, barbershopId: plan.barbershopId, status: "pending", updatedAt: new Date() })
              .where(eq(subscriptions.id, existingSub.id));
          } else {
            await db.insert(subscriptions).values({
              clientUserId: clientUser.id,
              planId: plan.id,
              barbershopId: plan.barbershopId,
              status: "pending",
              creditsRemaining: 0,
            });
          }
          console.log(`[SubscriptionCheckout] Pending criado — clientUser:${clientUser.id} plano:${plan.id}`);
        }

        const checkoutUrl = `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=${plan.mpPreapprovalPlanId}`;
        console.log(`[SubscriptionCheckout] Redirecionando para checkout MP do plano ${plan.mpPreapprovalPlanId}`);
        return { checkoutUrl };
      } else {
        // Fallback: Checkout Pro (pagamento único sem recorrência automática)
        const preferenceBody = {
          items: [{
            title: `Plano ${plan.name} — Barbearia`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: plan.priceInCents / 100,
          }],
          back_urls: {
            success: `${origin}/b/${input.slug}/minha-conta?subscription=success`,
            failure: `${origin}/b/${input.slug}?subscription=cancelled`,
            pending: `${origin}/b/${input.slug}/minha-conta?subscription=pending`,
          },
          auto_return: "approved",
          notification_url: `${BASE_URL}/api/mp/webhook`,
          external_reference: `clientUserId:${clientUser.id}|planId:${plan.id}`,
          metadata: {
            client_user_id: clientUser.id.toString(),
            plan_id: plan.id.toString(),
            barbershop_id: barbershop.id.toString(),
          },
        };

        const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${barbershopToken}`,
          },
          body: JSON.stringify(preferenceBody),
        });

        if (!mpRes.ok) {
          const err = await mpRes.text();
          console.error(`[SubscriptionCheckout] Erro MP Preference (HTTP ${mpRes.status}):`, err);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar checkout" });
        }

        const preference = await mpRes.json() as any;
        return { checkoutUrl: preference.init_point };
      }
    }),

  // Cancelar agendamento (com devolução de crédito se aplicável)
  cancelAppointment: publicProcedure
    .input(z.object({
      slug: z.string(),
      appointmentId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const clientUser = await getClientUser((ctx as any).req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Busca o agendamento garantindo que pertence ao cliente
      const [appt] = await db.select({
        id: appointments.id,
        status: appointments.status,
        isGuestBooking: appointments.isGuestBooking,
        creditRefunded: appointments.creditRefunded,
        appointmentDate: appointments.appointmentDate,
        clientId: appointments.clientId,
      })
        .from(appointments)
        .where(
          and(
            eq(appointments.id, input.appointmentId),
            eq(appointments.clientId, clientUser.clientId!)
          )
        )
        .limit(1);

      if (!appt) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });

      if (appt.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este agendamento já foi cancelado." });
      }

      if (appt.status === "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível cancelar um agendamento já concluído." });
      }

      // Marca como cancelado
      await db.update(appointments).set({
        status: "cancelled",
        cancellationReason: input.reason ?? null,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(appointments.id, appt.id));

      // Devolve crédito se: agendamento não era guest, tinha status confirmed, e ainda não foi devolvido
      let creditsRefunded = false;
      if (!appt.isGuestBooking && appt.status === "confirmed" && !appt.creditRefunded) {
        const [sub] = await db.select({ id: subscriptions.id, creditsRemaining: subscriptions.creditsRemaining, planId: subscriptions.planId })
          .from(subscriptions)
          .where(and(eq(subscriptions.clientUserId, clientUser.id), eq(subscriptions.status, "active")))
          .limit(1);

        if (sub && sub.planId) {
          // Verifica se o plano é ilimitado (não precisa devolver crédito)
          const [plan] = await db.select({ isUnlimited: plans.isUnlimited, creditsPerMonth: plans.creditsPerMonth })
            .from(plans).where(eq(plans.id, sub.planId)).limit(1);

          if (plan && !plan.isUnlimited) {
            await db.update(subscriptions)
              .set({ creditsRemaining: sub.creditsRemaining + 1, updatedAt: new Date() })
              .where(eq(subscriptions.id, sub.id));
            await db.update(appointments)
              .set({ creditRefunded: true })
              .where(eq(appointments.id, appt.id));
            creditsRefunded = true;
          }
        }
      }

      return { success: true, creditsRefunded };
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

      if (!sub) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma assinatura ativa encontrada" });
      }

      // Cancela no MP se tiver ID de assinatura recorrente
      if (sub.mpSubscriptionId) {
        const accessToken = MP_ACCESS_TOKEN;
        await fetch(`https://api.mercadopago.com/preapproval/${sub.mpSubscriptionId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: "cancelled" }),
        });
      }

      await db.update(subscriptions).set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, sub.id));

      return { success: true };
    }),
});
