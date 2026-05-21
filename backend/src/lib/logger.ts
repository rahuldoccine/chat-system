import pino from "pino";
import type { AppConfig } from "../config/index.js";

export type Logger = pino.Logger;

export function createLogger(config: AppConfig): Logger {
  if (config.isDev && config.logLevel !== "silent") {
    return pino({
      level: config.logLevel,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname,env,req,res,responseTime,requestId,err",
          singleLine: true,
          messageFormat: "{msg}",
        },
      },
    });
  }

  return pino({
    level: config.logLevel,
    base: { env: config.nodeEnv },
  });
}

/** Short one-line messages for dev startup (Express-style console). */
export function logDevBanner(logger: Logger, lines: string[]): void {
  for (const line of lines) {
    logger.info(line);
  }
}
