import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getUserById } from "../db";
import { COOKIE_NAME } from "@shared/const";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // Pega o cookie de sessão
    const cookieHeader = opts.req.headers.cookie ?? "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map(c => {
        const [k, ...v] = c.trim().split("=");
        return [k, v.join("=")];
      })
    );
    const sessionToken = cookies[COOKIE_NAME];

    if (sessionToken) {
      const session = await sdk.verifySession(sessionToken);
      if (session?.openId) {
        // openId agora armazena o id numérico do usuário (auth própria)
        const userId = parseInt(session.openId);
        if (!isNaN(userId)) {
          user = await getUserById(userId) ?? null;
        }
      }
    }
  } catch {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}