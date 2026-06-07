import type { PublicClient } from "viem";
import { erc721MetadataAbi } from "./abi/erc721";
import logger from "./logger";
import type { CollectionConfig } from "./types";

export type TokenMeta = {
  name?: string;
  imageUrl?: string;
};

function ipfsToHttps(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }
  return uri;
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      logger.debug(`Metadata fetch failed (${response.status}) for ${url}`);
      return null;
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    logger.debug(`Metadata fetch error for ${url}`, error);
    return null;
  }
}

/**
 * Resolve a token's display name and image URL. Prefers the collection's
 * `jsonBaseUri` if configured, otherwise reads `tokenURI` on-chain. Always
 * returns an object (empty if everything fails) so embeds can degrade
 * gracefully.
 */
export async function getTokenMeta({
  publicClient,
  collection,
  tokenId,
}: {
  publicClient: PublicClient;
  collection: CollectionConfig;
  tokenId: number;
}): Promise<TokenMeta> {
  let metadataUrl: string | undefined;

  if (collection.jsonBaseUri) {
    metadataUrl = `${collection.jsonBaseUri.replace(/\/$/, "")}/${tokenId}`;
  } else {
    try {
      const uri = await publicClient.readContract({
        address: collection.contractAddress,
        abi: erc721MetadataAbi,
        functionName: "tokenURI",
        args: [BigInt(tokenId)],
      });
      metadataUrl = ipfsToHttps(uri);
    } catch (error) {
      logger.debug(
        `Failed to read tokenURI for ${collection.name} #${tokenId}`,
        error,
      );
    }
  }

  if (!metadataUrl) return {};

  const metadata = await fetchJson(metadataUrl);
  if (!metadata) return {};

  const name = typeof metadata.name === "string" ? metadata.name : undefined;
  const image = typeof metadata.image === "string" ? metadata.image : undefined;

  return { name, imageUrl: ipfsToHttps(image) };
}
