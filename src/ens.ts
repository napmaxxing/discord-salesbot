import { type Address, getAddress } from "viem";
import type { PublicClient } from "viem";
import logger from "./logger";

const ensCache = new Map<string, string | null>();

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Resolve an address to its ENS name, falling back to a shortened address.
 * Results (including misses) are cached for the lifetime of the process.
 */
export async function formatAddress(
  publicClient: PublicClient,
  address: Address,
): Promise<string> {
  const key = address.toLowerCase();

  if (ensCache.has(key)) {
    return ensCache.get(key) ?? shortenAddress(address);
  }

  try {
    const name = await publicClient.getEnsName({
      address: getAddress(address),
    });
    ensCache.set(key, name);
    return name ?? shortenAddress(address);
  } catch (error) {
    logger.debug(`Failed to resolve ENS for ${address}`, error);
    ensCache.set(key, null);
    return shortenAddress(address);
  }
}
