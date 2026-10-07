import type { MiddlewareHandler } from "hono";
import { config } from "../config";
import { verifyToken, type TokenClaims } from "./jwt";

export type AuthEnv = { Variables: { user: TokenClaims } };

export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const claims = token ? await verifyToken(token) : null;
  if (!claims) return c.json({ error: "unauthorized" }, 401);
  c.set("user", claims);
  await next();
};

/** Chamadas de servidor para servidor (game server -> API). */
export const requireInternal: MiddlewareHandler = async (c, next) => {
  if (c.req.header("x-internal-secret") !== config.internalSecret) return c.json({ error: "unauthorized" }, 401);
  await next();
};
