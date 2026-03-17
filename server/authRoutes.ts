/**
 * server/authRoutes.ts
 * Registra as rotas REST de autenticação própria no Express
 * Adicionar no server/_core/index.ts
 */

import { Router, Request, Response } from "express";
import { registerBarbershop, loginWithEmail, getCurrentUser } from "./auth";
import { verifyEmailToken, createVerificationToken, sendVerificationEmail, canResendVerification } from "./emailService";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";

export const authRouter = Router();

// POST /api/auth/register - Registrar nova barbearia + owner
authRouter.post("/register", registerBarbershop);

// POST /api/auth/login - Login com email/senha
authRouter.post("/login", loginWithEmail);

// GET /api/auth/me - Retorna usuário atual via session
authRouter.get("/me", getCurrentUser);

// POST /api/auth/logout - Limpa o cookie de sessão
authRouter.post("/logout", (req, res) => {
  res.clearCookie("session", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return res.json({ success: true });
});

// GET /api/auth/verify-email?token=... - Verificar email via link
authRouter.get("/verify-email", async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      return res.redirect("/?error=token_missing");
    }

    const result = await verifyEmailToken(token);
    if (!result.valid) {
      const errorParam = encodeURIComponent(result.error ?? "Token inválido");
      const redirectPath = result.userType === "client" ? "/" : "/verificar-email";
      return res.redirect(`${redirectPath}?error=${errorParam}`);
    }

    // Redirecionar para o local adequado com sucesso
    return res.redirect("/?emailVerified=true");
  } catch (error) {
    console.error("[Auth] Verify email error:", error);
    return res.redirect("/?error=internal");
  }
});

// POST /api/auth/resend-verification - Reenviar email de verificação (owner)
authRouter.post("/resend-verification", async (req: Request, res: Response) => {
  try {
    const cookies = req.headers.cookie ?? "";
    const cookieMap = Object.fromEntries(
      cookies.split(";").map(c => c.trim().split("=").map(decodeURIComponent))
    );
    const sessionToken = cookieMap[COOKIE_NAME];
    if (!sessionToken) return res.status(401).json({ error: "Não autenticado" });

    const session = await sdk.verifySession(sessionToken);
    if (!session) return res.status(401).json({ error: "Sessão inválida" });

    const userId = parseInt(session.openId);
    if (isNaN(userId)) return res.status(401).json({ error: "Sessão inválida" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco indisponível" });

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    if (user.emailVerified) {
      return res.json({ success: true, message: "Email já verificado" });
    }

    const allowed = await canResendVerification("owner", userId);
    if (!allowed) {
      return res.status(429).json({ error: "Aguarde 1 minuto para reenviar" });
    }

    const verifyToken = await createVerificationToken("owner", userId, user.email ?? "");
    await sendVerificationEmail(user.email ?? "", user.name ?? "", verifyToken, {
      userType: "owner",
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("[Auth] Resend verification error:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});