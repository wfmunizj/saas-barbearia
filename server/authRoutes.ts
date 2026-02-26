/**
 * server/authRoutes.ts
 * Registra as rotas REST de autenticação própria no Express
 * Adicionar no server/_core/index.ts
 */

import { Router } from "express";
import { registerBarbershop, loginWithEmail, getCurrentUser } from "./auth";

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