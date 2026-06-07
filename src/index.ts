import type { Address } from "viem";
import { transferEvent } from "./abi/erc721";
import { resolveStartBlock } from "./blocks";
import { publicClient } from "./chain";
import { env, loadCollections } from "./config";
import { client, startBot } from "./discord/bot";
import { Notifier } from "./discord/notifier";
import logger from "./logger";
import { getEventsFromLogs } from "./process";
import { loadState, saveState } from "./state";
import type { CollectionConfig } from "./types";

async function main(): Promise<void> {
  const collections = loadCollections();

  const nonEthereum = collections.filter((c) => c.chain !== "ethereum");
  if (nonEthereum.length) {
    logger.warn(
      `These collections are configured for a non-ethereum chain and will be watched on mainnet anyway: ${nonEthereum
        .map((c) => c.name)
        .join(", ")}`,
    );
  }

  const byAddress = new Map<Address, CollectionConfig>();
  for (const collection of collections) {
    byAddress.set(collection.contractAddress, collection);
  }

  await startBot();

  const state = loadState();

  // In-memory checkpoint map shared across all collection loops.
  const checkpoints = new Map<string, bigint>(
    Object.entries(state.checkpoints),
  );

  const notifier = new Notifier(client, publicClient, byAddress, {
    cooldownMs: env.postCooldownMs,
    seen: state.seen,
  });

  const persistState = () => {
    saveState({
      checkpoints: Object.fromEntries(checkpoints),
      seen: notifier.getSeen(),
    });
  };

  logger.info(
    `Watching ${collections.length} collection(s): ${collections
      .map((c) => c.name)
      .join(", ")}`,
  );

  const startCollection = async (collection: CollectionConfig): Promise<void> => {
    const address = collection.contractAddress;
    const addrKey = address.toLowerCase();
    const intervalMs = collection.pollIntervalMs ?? env.pollIntervalMs;
    const watched = new Set<Address>([address]);

    // Resolve initial checkpoint for this collection.
    let checkpoint: bigint;
    if (checkpoints.has(addrKey)) {
      checkpoint = checkpoints.get(addrKey)!;
      logger.info(
        `[${collection.name}] Resuming from saved checkpoint at block ${checkpoint}`,
      );
    } else if (state.lastProcessedBlock != null) {
      // Migrate from the old single-checkpoint format.
      checkpoint = state.lastProcessedBlock;
      logger.info(
        `[${collection.name}] Migrating from global checkpoint at block ${checkpoint}`,
      );
    } else if (env.backfillFrom) {
      const startBlock = await resolveStartBlock(publicClient, env.backfillFrom);
      checkpoint = startBlock - 1n;
      logger.info(
        `[${collection.name}] Backfilling from block ${startBlock} (${env.backfillFrom})`,
      );
    } else {
      checkpoint = await publicClient.getBlockNumber();
      logger.info(
        `[${collection.name}] No state or backfill configured; starting live at block ${checkpoint}`,
      );
    }

    const processRange = async (from: bigint, to: bigint): Promise<void> => {
      for (let start = from; start <= to; start += env.logBlockChunk) {
        const end =
          start + env.logBlockChunk - 1n < to
            ? start + env.logBlockChunk - 1n
            : to;

        const logs = await publicClient.getLogs({
          address: [address],
          event: transferEvent,
          fromBlock: start,
          toBlock: end,
        });

        if (logs.length) {
          logger.debug(
            `[${collection.name}] Found ${logs.length} Transfer event(s) in blocks ${start}-${end}`,
          );
          const events = await getEventsFromLogs({ logs, publicClient, watched });
          await notifier.postEvents(events);
        }

        checkpoint = end;
        checkpoints.set(addrKey, checkpoint);
        persistState();
      }
    };

    // Catch up on any blocks missed since the last checkpoint.
    const tip = await publicClient.getBlockNumber();
    if (tip > checkpoint) {
      logger.info(
        `[${collection.name}] Catching up from block ${checkpoint + 1n} to ${tip}...`,
      );
      await processRange(checkpoint + 1n, tip);
      logger.success(
        `[${collection.name}] Catch-up complete; switching to live polling`,
      );
    }

    // Live polling loop.
    let isPolling = false;
    const poll = async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        const current = await publicClient.getBlockNumber();
        if (current > checkpoint) {
          await processRange(checkpoint + 1n, current);
        }
      } catch (error) {
        logger.error(`[${collection.name}] Error polling for events`, error);
      } finally {
        isPolling = false;
      }
    };

    setInterval(poll, intervalMs);
    logger.info(`[${collection.name}] Polling every ${intervalMs}ms`);
  };

  // Start collections sequentially to avoid hammering the RPC during catch-up.
  for (const collection of collections) {
    await startCollection(collection);
  }
}

main().catch((error) => {
  logger.error("Fatal error in main", error);
  process.exit(1);
});
