import type { Hex, PublicClient } from "viem";
import logger from "./logger";

/**
 * Find the first block whose timestamp is >= `targetUnixSeconds`, via binary
 * search over block timestamps (~25 RPC calls on mainnet).
 */
export async function getBlockNumberForTimestamp(
  publicClient: PublicClient,
  targetUnixSeconds: bigint,
): Promise<bigint> {
  let low = 0n;
  let high = await publicClient.getBlockNumber();

  while (low < high) {
    const mid = (low + high) / 2n;
    const block = await publicClient.getBlock({ blockNumber: mid });
    if (block.timestamp < targetUnixSeconds) {
      low = mid + 1n;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * Resolve a start point into the first block to process. Accepts:
 * - a transaction hash ("0x…64 hex") → the block *after* that tx (so an
 *   already-posted sale at that tx is not re-posted)
 * - a raw block number ("12345678")
 * - a date string ("2026-03-24" or full ISO)
 */
export async function resolveStartBlock(
  publicClient: PublicClient,
  input: string,
): Promise<bigint> {
  const trimmed = input.trim();

  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    const receipt = await publicClient.getTransactionReceipt({
      hash: trimmed as Hex,
    });
    const startBlock = receipt.blockNumber + 1n;
    logger.info(
      `Resolved tx ${trimmed} (block ${receipt.blockNumber}); starting from block ${startBlock}`,
    );
    return startBlock;
  }

  if (/^\d+$/.test(trimmed)) {
    return BigInt(trimmed);
  }

  const iso = trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00Z`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(
      `Invalid BACKFILL_FROM value "${input}". Use a tx hash, a block number, or a date like 2026-03-24.`,
    );
  }

  const target = BigInt(Math.floor(ms / 1000));
  const block = await getBlockNumberForTimestamp(publicClient, target);
  logger.info(`Resolved ${trimmed} to block ${block}`);
  return block;
}
