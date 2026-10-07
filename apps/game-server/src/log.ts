import pino from "pino";
import { config } from "./config";

export const log = pino({
  level: config.logLevel,
  base: { server: config.serverId },
  ...(process.env.NODE_ENV !== "production" ? { transport: { target: "pino/file", options: { destination: 1 } } } : {}),
});
