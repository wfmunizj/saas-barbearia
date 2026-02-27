/**
 * server/barberUserRoutes.ts
 * Rotas para o owner gerenciar usuários barbeiros da sua barbearia
 */

import { Router, Request, Response } from "express";
import { getDb } from "./db";
import { users, barbers, barbershops } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createPasswordHash } from "./auth";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";

export const barberUserRouter = Router();

// Helper: pega o usuário autenticado e verifica se é owner
async function getOwnerUser(req: Request) {
  const cookies = req.headers.cookie ?? "";
  const cookieMap = Object.fromEntries(
    cookies.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [decodeURIComponent(k.trim()), decodeURIComponent(v.join("="))];
    })
  );
  const sessionToken = cookieMap[COOKIE_NAME];
  if (!sessionToken) return null;

  const session = await sdk.verifySession(sessionToken);
  if (!session) return null;

  const userId = parseInt(session.openId);
  if (isNaN(userId)) return null;

  const db = await getDb();
  if (!db) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== "owner") return null;

  return user;
}

// POST /api/barber-users/create
// Owner cria login para um barbeiro existente
barberUserRouter.post("/create", async (req: Request, res: Response) => {
  try {
    const owner = await getOwnerUser(req);
    if (!owner) return res.status(401).json({ error: "Não autorizado" });

    const { barberId, email, password, name } = req.body;

    if (!barberId || !email || !password || !name) {
      return res.status(400).json({ error: "barberId, email, senha e nome são obrigatórios" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco indisponível" });

    // Verifica se o barbeiro pertence à mesma barbearia do owner
    const [barber] = await db
      .select()
      .from(barbers)
      .where(and(eq(barbers.id, barberId), eq(barbers.barbershopId, owner.barbershopId!)))
      .limit(1);

    if (!barber) return res.status(404).json({ error: "Barbeiro não encontrado" });

    // Verifica se já tem usuário vinculado
    if (barber.userId) {
      return res.status(409).json({ error: "Este barbeiro já possui um login" });
    }

    // Verifica se email já existe
    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) return res.status(409).json({ error: "Este email já está em uso" });

    // Cria o usuário com role "barber"
    const passwordHash = createPasswordHash(password);
    const [newUser] = await db
      .insert(users)
      .values({
        barbershopId: owner.barbershopId!,
        name,
        email,
        passwordHash,
        loginMethod: "email",
        role: "barber",
        isActive: true,
        lastSignedIn: new Date(),
      })
      .returning();

    // Vincula o userId ao barbeiro
    await db
      .update(barbers)
      .set({ userId: newUser.id, updatedAt: new Date() })
      .where(eq(barbers.id, barberId));

    return res.json({
      success: true,
      user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
    });
  } catch (error) {
    console.error("[BarberUsers] create error:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// GET /api/barber-users/list
// Owner lista todos os barbeiros e se têm login
barberUserRouter.get("/list", async (req: Request, res: Response) => {
  try {
    const owner = await getOwnerUser(req);
    if (!owner) return res.status(401).json({ error: "Não autorizado" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco indisponível" });

    const barberList = await db
      .select({
        id: barbers.id,
        name: barbers.name,
        email: barbers.email,
        phone: barbers.phone,
        isActive: barbers.isActive,
        userId: barbers.userId,
      })
      .from(barbers)
      .where(eq(barbers.barbershopId, owner.barbershopId!));

    // Para cada barbeiro com userId, busca o email do user
    const result = await Promise.all(
      barberList.map(async (b) => {
        if (!b.userId) return { ...b, userEmail: null, hasLogin: false };
        const [u] = await db
          .select({ email: users.email, isActive: users.isActive })
          .from(users)
          .where(eq(users.id, b.userId))
          .limit(1);
        return { ...b, userEmail: u?.email ?? null, hasLogin: true, userIsActive: u?.isActive };
      })
    );

    return res.json(result);
  } catch (error) {
    console.error("[BarberUsers] list error:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// DELETE /api/barber-users/:barberId/remove-login
// Owner remove o login de um barbeiro
barberUserRouter.delete("/:barberId/remove-login", async (req: Request, res: Response) => {
  try {
    const owner = await getOwnerUser(req);
    if (!owner) return res.status(401).json({ error: "Não autorizado" });

    const barberId = parseInt(req.params.barberId);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco indisponível" });

    const [barber] = await db
      .select()
      .from(barbers)
      .where(and(eq(barbers.id, barberId), eq(barbers.barbershopId, owner.barbershopId!)))
      .limit(1);

    if (!barber) return res.status(404).json({ error: "Barbeiro não encontrado" });
    if (!barber.userId) return res.status(400).json({ error: "Barbeiro não possui login" });

    // Desativa o usuário e remove o vínculo
    await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, barber.userId));
    await db.update(barbers).set({ userId: null, updatedAt: new Date() }).where(eq(barbers.id, barberId));

    return res.json({ success: true });
  } catch (error) {
    console.error("[BarberUsers] remove-login error:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});