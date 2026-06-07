import type { Address, Hex, PublicClient } from "viem";
import logger from "../logger";
import type { NftEvent, SaleEvent } from "../types";
import { parseBlurEvents } from "./blur";
import { parseSeaportEvents } from "./opensea";
import { type TransferLog, parseTransfers } from "./transfers";

/**
 * Turn a batch of ERC721 Transfer logs into NFT events:
 * - mints/burns are derived directly from the transfer logs
 * - sales are parsed from the marketplace events in each involved transaction
 */
export async function getEventsFromLogs({
  logs,
  publicClient,
  watched,
}: {
  logs: TransferLog[];
  publicClient: PublicClient;
  watched: Set<Address>;
}): Promise<NftEvent[]> {
  const { mints, burns } = parseTransfers(logs);

  const txHashes = Array.from(
    new Set(
      logs
        .map((log) => log.transactionHash)
        .filter((hash): hash is Hex => Boolean(hash)),
    ),
  );

  const sales: SaleEvent[] = [];
  for (const hash of txHashes) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      sales.push(...parseSeaportEvents({ logs: receipt.logs, watched }));
      sales.push(...parseBlurEvents({ logs: receipt.logs, watched }));
    } catch (error) {
      logger.error(`Failed to process transaction ${hash}`, error);
    }
  }

  return [...sales, ...mints, ...burns];
}

export { parseSeaportEvents } from "./opensea";
export { parseBlurEvents } from "./blur";
export { parseTransfers } from "./transfers";
