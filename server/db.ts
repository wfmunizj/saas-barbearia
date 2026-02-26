import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  InsertUser,
  users,
  clients,
  InsertClient,
  barbers,
  InsertBarber,
  services,
  InsertService,
  appointments,
  InsertAppointment,
  payments,
  InsertPayment,
  campaigns,
  InsertCampaign,
  coupons,
  InsertCoupon,
  whatsappMessages,
  InsertWhatsappMessage,
  messageTemplates,
  InsertMessageTemplate,
  settings,
  InsertSetting,
  barberSchedules,
  InsertBarberSchedule,
  barbershops,
  InsertBarbershop,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL, { ssl: "require" });
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Auth / Users ─────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { ...user };
  if (!values.lastSignedIn) values.lastSignedIn = new Date();

  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.openId,
      set: { ...values, updatedAt: new Date() },
    });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

// ─── Barbershops ──────────────────────────────────────────────────────────────

export async function createBarbershop(data: InsertBarbershop) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(barbershops).values(data).returning();
  return result[0];
}

export async function getBarbershopById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(barbershops).where(eq(barbershops.id, id)).limit(1);
  return result[0];
}

export async function getBarbershopBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(barbershops).where(eq(barbershops.slug, slug)).limit(1);
  return result[0];
}

export async function updateBarbershop(id: number, data: Partial<InsertBarbershop>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(barbershops)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(barbershops.id, id))
    .returning();
  return result[0];
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function getClients(barbershopId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clients).where(eq(clients.barbershopId, barbershopId)).orderBy(desc(clients.createdAt));
}

export async function getClientById(id: number, barbershopId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clients).where(
    and(eq(clients.id, id), eq(clients.barbershopId, barbershopId))
  ).limit(1);
  return result[0];
}

export async function createClient(data: InsertClient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clients).values(data).returning();
  return result[0];
}

export async function updateClient(id: number, barbershopId: number, data: Partial<InsertClient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(clients)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(clients.id, id), eq(clients.barbershopId, barbershopId)))
    .returning();
  return result[0];
}

export async function deleteClient(id: number, barbershopId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clients).where(and(eq(clients.id, id), eq(clients.barbershopId, barbershopId)));
}

export async function getInactiveClients(barbershopId: number, daysSinceLastVisit: number) {
  const db = await getDb();
  if (!db) return [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastVisit);
  return db.select().from(clients).where(
    and(
      eq(clients.barbershopId, barbershopId),
      eq(clients.isActive, true),
      lte(clients.lastVisit, cutoffDate)
    )
  );
}

// ─── Barbers ──────────────────────────────────────────────────────────────────

export async function getBarbers(barbershopId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(barbers).where(eq(barbers.barbershopId, barbershopId)).orderBy(barbers.name);
}

export async function getBarberById(id: number, barbershopId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(barbers).where(
    and(eq(barbers.id, id), eq(barbers.barbershopId, barbershopId))
  ).limit(1);
  return result[0];
}

export async function createBarber(data: InsertBarber) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(barbers).values(data).returning();
  return result[0];
}

export async function updateBarber(id: number, barbershopId: number, data: Partial<InsertBarber>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(barbers)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(barbers.id, id), eq(barbers.barbershopId, barbershopId)))
    .returning();
  return result[0];
}

export async function deleteBarber(id: number, barbershopId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(barbers).where(and(eq(barbers.id, id), eq(barbers.barbershopId, barbershopId)));
}

// ─── Barber Schedules ─────────────────────────────────────────────────────────

export async function getBarberSchedules(barberId: number, barbershopId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(barberSchedules).where(
    and(eq(barberSchedules.barberId, barberId), eq(barberSchedules.barbershopId, barbershopId))
  );
}

export async function upsertBarberSchedule(data: InsertBarberSchedule) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(barberSchedules).values(data).returning();
  return result[0];
}

// ─── Services ─────────────────────────────────────────────────────────────────

export async function getServices(barbershopId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(services).where(eq(services.barbershopId, barbershopId)).orderBy(services.name);
}

export async function getServiceById(id: number, barbershopId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(services).where(
    and(eq(services.id, id), eq(services.barbershopId, barbershopId))
  ).limit(1);
  return result[0];
}

export async function createService(data: InsertService) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(services).values(data).returning();
  return result[0];
}

export async function updateService(id: number, barbershopId: number, data: Partial<InsertService>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(services)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(services.id, id), eq(services.barbershopId, barbershopId)))
    .returning();
  return result[0];
}

export async function deleteService(id: number, barbershopId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(services).where(and(eq(services.id, id), eq(services.barbershopId, barbershopId)));
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export async function getAppointments(barbershopId: number, filters?: { startDate?: Date; endDate?: Date }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(appointments.barbershopId, barbershopId)];
  if (filters?.startDate) conditions.push(gte(appointments.appointmentDate, filters.startDate));
  if (filters?.endDate) conditions.push(lte(appointments.appointmentDate, filters.endDate));

  return db.select().from(appointments).where(and(...conditions)).orderBy(desc(appointments.appointmentDate));
}

export async function createAppointment(data: InsertAppointment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(appointments).values(data).returning();
  return result[0];
}

export async function updateAppointment(id: number, barbershopId: number, data: Partial<InsertAppointment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(appointments)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(appointments.id, id), eq(appointments.barbershopId, barbershopId)))
    .returning();
  return result[0];
}

export async function checkAppointmentConflict(barberId: number, barbershopId: number, appointmentDate: Date, excludeId?: number) {
  const db = await getDb();
  if (!db) return false;

  const conditions = [
    eq(appointments.barberId, barberId),
    eq(appointments.barbershopId, barbershopId),
    eq(appointments.appointmentDate, appointmentDate),
  ];
  if (excludeId) {
    conditions.push(sql`${appointments.id} != ${excludeId}`);
  }

  const result = await db.select().from(appointments).where(and(...conditions)).limit(1);
  return result.length > 0;
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function getPayments(barbershopId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payments).where(eq(payments.barbershopId, barbershopId)).orderBy(desc(payments.createdAt));
}

export async function createPayment(data: InsertPayment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(payments).values(data).returning();
  return result[0];
}

export async function updatePaymentByStripeSession(stripeSessionId: string, data: Partial<InsertPayment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(payments)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(payments.stripeSessionId, stripeSessionId))
    .returning();
  return result[0];
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export async function getCampaigns(barbershopId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns).where(eq(campaigns.barbershopId, barbershopId)).orderBy(desc(campaigns.createdAt));
}

export async function createCampaign(data: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(campaigns).values(data).returning();
  return result[0];
}

export async function updateCampaign(id: number, barbershopId: number, data: Partial<InsertCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(campaigns)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(campaigns.id, id), eq(campaigns.barbershopId, barbershopId)))
    .returning();
  return result[0];
}

// ─── WhatsApp Messages ────────────────────────────────────────────────────────

export async function getWhatsappMessages(barbershopId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(whatsappMessages).where(eq(whatsappMessages.barbershopId, barbershopId)).orderBy(desc(whatsappMessages.createdAt));
}

export async function createWhatsappMessage(data: InsertWhatsappMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(whatsappMessages).values(data).returning();
  return result[0];
}

export async function updateWhatsappMessageStatus(id: number, status: "pending" | "sent" | "failed", evolutionMessageId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(whatsappMessages)
    .set({
      status,
      evolutionMessageId: evolutionMessageId ?? undefined,
      sentAt: status === "sent" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(whatsappMessages.id, id))
    .returning();
  return result[0];
}

// ─── Message Templates ────────────────────────────────────────────────────────

export async function getMessageTemplates(barbershopId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(messageTemplates).where(eq(messageTemplates.barbershopId, barbershopId));
}

export async function createMessageTemplate(data: InsertMessageTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(messageTemplates).values(data).returning();
  return result[0];
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(barbershopId: number, key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(settings).where(
    and(eq(settings.barbershopId, barbershopId), eq(settings.key, key))
  ).limit(1);
  return result[0];
}

export async function upsertSetting(data: InsertSetting) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(settings)
    .values(data)
    .onConflictDoUpdate({
      target: [settings.barbershopId, settings.key],
      set: { value: data.value, description: data.description, updatedAt: new Date() },
    })
    .returning();
  return result[0];
}

// ─── Analytics / Dashboard ────────────────────────────────────────────────────

export async function getDashboardStats(barbershopId: number) {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [totalClients] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clients)
    .where(and(eq(clients.barbershopId, barbershopId), eq(clients.isActive, true)));

  const [monthlyAppointments] = await db
    .select({ count: sql<number>`count(*)` })
    .from(appointments)
    .where(
      and(
        eq(appointments.barbershopId, barbershopId),
        gte(appointments.appointmentDate, startOfMonth),
        lte(appointments.appointmentDate, endOfMonth)
      )
    );

  const [monthlyRevenue] = await db
    .select({ total: sql<number>`coalesce(sum(amount_in_cents), 0)` })
    .from(payments)
    .where(
      and(
        eq(payments.barbershopId, barbershopId),
        eq(payments.status, "completed"),
        gte(payments.createdAt, startOfMonth),
        lte(payments.createdAt, endOfMonth)
      )
    );

  return {
    totalClients: Number(totalClients?.count ?? 0),
    monthlyAppointments: Number(monthlyAppointments?.count ?? 0),
    monthlyRevenue: Number(monthlyRevenue?.total ?? 0),
  };
}
