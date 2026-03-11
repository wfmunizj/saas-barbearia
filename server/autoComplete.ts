/**
 * autoComplete.ts
 *
 * Auto-complete de agendamentos passados.
 * Roda às 23:30 diariamente (sem dependências externas — setTimeout recursivo).
 * Também pode ser acionado manualmente via tRPC (appointments.triggerAutoComplete).
 *
 * Lógica idêntica ao bloco `status === "completed"` em appointments.update:
 *   - Plano ilimitado → cria barberFichaRecords
 *   - Avulso / créditos → cria barberCommissionRecords
 * onConflictDoNothing() protege contra duplicatas se rodar mais de uma vez.
 */

import { getDb } from "./db";
import {
  appointments,
  barbers,
  appointmentServices,
  services,
  subscriptions,
  clientUsers,
  plans,
  barberCommissionRecords,
  barberFichaRecords,
} from "../drizzle/schema";
import { and, inArray, lt, eq, sql } from "drizzle-orm";

export async function autoCompletePastAppointments(barbershopId?: number): Promise<{
  completed: number;
  errors: number;
}> {
  const db = await getDb();
  if (!db) return { completed: 0, errors: 0 };

  const now = new Date();

  // Filtra agendamentos passados ainda não concluídos/cancelados
  const baseWhere = and(
    inArray(appointments.status, ["confirmed", "pending"]),
    lt(appointments.scheduledAt, now),
  );
  const whereClause = barbershopId
    ? and(baseWhere, eq(appointments.barbershopId, barbershopId))
    : baseWhere;

  const pastAppointments = await db
    .select({
      id: appointments.id,
      barberId: appointments.barberId,
      clientId: appointments.clientId,
      barbershopId: appointments.barbershopId,
      commissionPercent: barbers.commissionPercent,
      priceInCents: sql<number>`COALESCE(SUM(${appointmentServices.priceInCents}), MAX(${services.priceInCents}), 0)`,
      durationMinutes: sql<number>`COALESCE(SUM(${appointmentServices.durationMinutes}), MAX(${services.durationMinutes}), 30)`,
      fichaValueInCents: sql<number>`COALESCE(MAX(${appointmentServices.fichaValueInCents}), MAX(${services.fichaValueInCents}), 0)`,
    })
    .from(appointments)
    .innerJoin(barbers, eq(appointments.barberId, barbers.id))
    .leftJoin(appointmentServices, eq(appointmentServices.appointmentId, appointments.id))
    .leftJoin(
      services,
      sql`${services.id} = COALESCE(${appointmentServices.serviceId}, ${appointments.serviceId})`,
    )
    .where(whereClause)
    .groupBy(appointments.id, barbers.id);

  let completed = 0;
  let errors = 0;

  for (const appt of pastAppointments) {
    try {
      // 1. Marcar como concluído
      await db
        .update(appointments)
        .set({ status: "completed" })
        .where(eq(appointments.id, appt.id));

      // 2. Verificar plano ilimitado ativo do cliente
      const unlimitedSub = await db
        .select({ isUnlimited: plans.isUnlimited })
        .from(subscriptions)
        .innerJoin(clientUsers, eq(subscriptions.clientUserId, clientUsers.id))
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .where(
          and(
            eq(clientUsers.clientId, appt.clientId),
            eq(clientUsers.barbershopId, appt.barbershopId),
            eq(subscriptions.status, "active"),
            eq(plans.isUnlimited, true),
          ),
        )
        .limit(1);

      const isUnlimitedPlan = unlimitedSub.length > 0;

      if (isUnlimitedPlan) {
        // Plano ilimitado: fichas por tempo (1 ficha por 15 min)
        const durationMin = Number(appt.durationMinutes ?? 30);
        const fichasCount = Math.ceil(durationMin / 15);
        const fichaValueInCents = Number(appt.fichaValueInCents ?? 0);
        const totalValueInCents = fichasCount * fichaValueInCents;

        await db
          .insert(barberFichaRecords)
          .values({
            barbershopId: appt.barbershopId,
            barberId: appt.barberId,
            appointmentId: appt.id,
            fichasCount,
            fichaValueInCents,
            totalValueInCents,
          })
          .onConflictDoNothing();
      } else {
        // Avulso / créditos: comissão sobre preço do serviço
        const commissionPct = parseFloat(appt.commissionPercent ?? "0");
        const serviceAmountInCents = Number(appt.priceInCents ?? 0);
        const commissionAmountInCents = Math.floor(
          (serviceAmountInCents * commissionPct) / 100,
        );

        await db
          .insert(barberCommissionRecords)
          .values({
            barbershopId: appt.barbershopId,
            barberId: appt.barberId,
            appointmentId: appt.id,
            commissionPercent: String(commissionPct),
            serviceAmountInCents,
            commissionAmountInCents,
          })
          .onConflictDoNothing();
      }

      completed++;
    } catch (err) {
      console.error(`[AutoComplete] Erro ao concluir appointment ${appt.id}:`, err);
      errors++;
    }
  }

  if (completed > 0 || errors > 0) {
    console.log(
      `[AutoComplete] ✅ ${completed} concluídos automaticamente` +
        (errors > 0 ? `, ⚠️ ${errors} erros` : ""),
    );
  } else {
    console.log("[AutoComplete] Nenhum agendamento passado encontrado.");
  }

  return { completed, errors };
}

/**
 * Agenda o auto-complete para rodar às 23:30 todo dia.
 * Usa setTimeout recursivo — sem dependências externas.
 */
export function scheduleAutoComplete() {
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date();
    next.setHours(23, 30, 0, 0);

    // Se já passou das 23:30 hoje, agenda para amanhã
    if (now >= next) {
      next.setDate(next.getDate() + 1);
    }

    const msUntilNext = next.getTime() - now.getTime();
    const minutesUntil = Math.round(msUntilNext / 60000);
    console.log(
      `[AutoComplete] Próxima execução às 23:30 (em ${minutesUntil} min)`,
    );

    setTimeout(async () => {
      console.log("[AutoComplete] Iniciando conclusão automática de agendamentos passados...");
      await autoCompletePastAppointments();
      scheduleNext(); // Re-agendar para o dia seguinte
    }, msUntilNext);
  };

  scheduleNext();
}
