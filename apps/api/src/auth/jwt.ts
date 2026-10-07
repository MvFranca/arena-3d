import { jwtVerify, SignJWT } from "jose";
import { config } from "../config";

const secret = new TextEncoder().encode(config.jwtSecret);

export interface TokenClaims {
  sub: string;
  name: string;
  guest: boolean;
}

/** Token lido pelo game server com o mesmo segredo. Carrega so identidade, nunca atributos. */
export async function signToken(claims: TokenClaims): Promise<string> {
  return new SignJWT({ name: claims.name, guest: claims.guest })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { sub: payload.sub, name: String(payload.name ?? ""), guest: payload.guest === true };
  } catch {
    return null;
  }
}
