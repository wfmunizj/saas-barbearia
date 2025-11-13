import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
  InsertBarberSchedule
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============= CLIENT OPERATIONS =============

export async function createClient(client: InsertClient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(clients).values(client);
  return result;
}

export async function getClients() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(clients).orderBy(desc(clients.createdAt));
}

export async function getClientById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return result[0];
}

export async function updateClient(id: number, data: Partial<InsertClient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(clients).set(data).where(eq(clients.id, id));
}

export async function deleteClient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.delete(clients).where(eq(clients.id, id));
}

export async function getInactiveClients(daysSinceLastVisit: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastVisit);
  
  return await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.isActive, true),
        lte(clients.lastVisit, cutoffDate)
      )
    );
}

// ============= BARBER OPERATIONS =============

export async function createBarber(barber: InsertBarber) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(barbers).values(barber);
}

export async function getBarbers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(barbers).where(eq(barbers.isActive, true));
}

export async function getBarberById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(barbers).where(eq(barbers.id, id)).limit(1);
  return result[0];
}

export async function updateBarber(id: number, data: Partial<InsertBarber>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(barbers).set(data).where(eq(barbers.id, id));
}

export async function deleteBarber(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(barbers).set({ isActive: false }).where(eq(barbers.id, id));
}

// ============= SERVICE OPERATIONS =============

export async function createService(service: InsertService) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(services).values(service);
}

export async function getServices() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(services).where(eq(services.isActive, true));
}

export async function getServiceById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(services).where(eq(services.id, id)).limit(1);
  return result[0];
}

export async function updateService(id: number, data: Partial<InsertService>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(services).set(data).where(eq(services.id, id));
}

export async function deleteService(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(services).set({ isActive: false }).where(eq(services.id, id));
}

// ============= APPOINTMENT OPERATIONS =============

export async function createAppointment(appointment: InsertAppointment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(appointments).values(appointment);
}

export async function getAppointments(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  let query = db.select().from(appointments);
  
  if (startDate && endDate) {
    query = query.where(
      and(
        gte(appointments.appointmentDate, startDate),
        lte(appointments.appointmentDate, endDate)
      )
    ) as any;
  }
  
  return await query.orderBy(desc(appointments.appointmentDate));
}

export async function getAppointmentById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return result[0];
}

export async function updateAppointment(id: number, data: Partial<InsertAppointment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(appointments).set(data).where(eq(appointments.id, id));
}

export async function getAppointmentsByBarber(barberId: number, date: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.barberId, barberId),
        gte(appointments.appointmentDate, startOfDay),
        lte(appointments.appointmentDate, endOfDay)
      )
    );
}

// ============= PAYMENT OPERATIONS =============

export async function createPayment(payment: InsertPayment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(payments).values(payment);
}

export async function getPayments() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(payments).orderBy(desc(payments.createdAt));
}

export async function getPaymentsByClient(clientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(payments).where(eq(payments.clientId, clientId));
}

// ============= CAMPAIGN OPERATIONS =============

export async function createCampaign(campaign: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(campaigns).values(campaign);
}

export async function getCampaigns() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}

export async function updateCampaign(id: number, data: Partial<InsertCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(campaigns).set(data).where(eq(campaigns.id, id));
}

// ============= COUPON OPERATIONS =============

export async function createCoupon(coupon: InsertCoupon) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(coupons).values(coupon);
}

export async function getCouponByCode(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  return result[0];
}

// ============= WHATSAPP MESSAGE OPERATIONS =============

export async function createWhatsappMessage(message: InsertWhatsappMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(whatsappMessages).values(message);
}

export async function getWhatsappMessages() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(whatsappMessages).orderBy(desc(whatsappMessages.createdAt));
}

// ============= MESSAGE TEMPLATE OPERATIONS =============

export async function createMessageTemplate(template: InsertMessageTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(messageTemplates).values(template);
}

export async function getMessageTemplates() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(messageTemplates).where(eq(messageTemplates.isActive, true));
}

// ============= SETTINGS OPERATIONS =============

export async function getSetting(key: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return result[0];
}

export async function upsertSetting(setting: InsertSetting) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(settings).values(setting).onDuplicateKeyUpdate({
    set: { value: setting.value },
  });
}
