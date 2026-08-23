/**
 * API process entrypoint. Boots config → logger → db → redis → app, then
 * listens. Graceful shutdown drains HTTP then closes pools.
 */

import { getConfig, redactedSummary } from "@openlobster/config";
import { createDb } from "@openlobster/db";
import { createRedis, ensureConsumerGroup } from "@openlobster/redis";
import { getLogger } from "@openlobster/logger";
import { buildApp } from "./app";
import { OutboxDispatcher } from "./outbox/dispatcher";

const logger = getLogger("api");

async function main(): Promise<void> {
  const cfg = getConfig();
  logger.info(`starting api (${redactedSummary(cfg)})`);

  const db = createDb({ url: cfg.database.url });
  const redis = createRedis({ url: cfg.redis.url });

  // Ensure the consumer group exists so the very first run is never lost
  // waiting for a worker to create it.
  await ensureConsumerGroup(redis).catch((err) =>
    logger.warn({ err: (err as Error).message }, "could not ensure consumer group yet"),
  );

  const app = buildApp({ cfg, db, redis, logger });

  const outbox = new OutboxDispatcher(db, redis, logger.child({ component: "outbox" }));
  outbox.start();

  const port = Number(process.env["PORT"] ?? 3000);
  const server = app.listen(port, () => {
    logger.info(`api listening on :${port}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    outbox.stop();
    server.close();
    const doShutdown = app.get("shutdown") as (() => Promise<void>) | undefined;
    if (doShutdown !== undefined) await doShutdown();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.stack : String(err) }, "api failed to start");
  process.exit(1);
});
