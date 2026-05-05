import { pino } from "pino";
import { config, isDevelopment } from "../config/index.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  ...(isDevelopment && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    },
  }),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.passwordHash",
      "*.password",
      "*.passwordHash",
      "*.apiKey",
    ],
    censor: "[REDACTED]",
  },
});
