import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { type Address, getAddress } from "viem";
import type { BurnMessage, CollectionConfig } from "./types";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const env = {
  discordToken: required("DISCORD_BOT_TOKEN"),
  rpcUrl: required("RPC_URL"),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 60_000),
  collectionsFile: process.env.COLLECTIONS_FILE ?? "collections.json",
  // Persistent checkpoint/dedup log so the bot resumes after downtime.
  stateFile: process.env.STATE_FILE ?? "state.json",
  // First-run starting point: a block number or a date (YYYY-MM-DD / ISO).
  // Only used when no state file exists yet; afterwards the state file wins.
  backfillFrom: process.env.BACKFILL_FROM,
  // Blocks fetched per eth_getLogs request while catching up.
  logBlockChunk: BigInt(process.env.LOG_BLOCK_CHUNK ?? "2000"),
  // Minimum delay between Discord posts (throttles backfill bursts).
  postCooldownMs: Number(process.env.POST_COOLDOWN_MS ?? 1500),
};

type RawCollection = {
  name?: string;
  chain?: string;
  contractAddress?: string;
  transactionLinkBase?: string;
  jsonBaseUri?: string;
  salesChannelId?: string | number;
  mintChannelId?: string | number;
  burnChannelId?: string | number;
  idCooldownMinutes?: number;
  burnMessages?: BurnMessage[];
  pollIntervalMs?: number;
};

function normalizeChannelId(
  id: string | number | undefined,
): string | undefined {
  if (id === undefined || id === null || id === "") return undefined;
  return String(id);
}

function normalize(raw: RawCollection): CollectionConfig {
  if (!raw.contractAddress) {
    throw new Error(
      `Collection "${raw.name ?? "(unnamed)"}" is missing contractAddress`,
    );
  }

  const contractAddress = getAddress(raw.contractAddress) as Address;

  return {
    name: raw.name ?? "Unknown Collection",
    chain: raw.chain ?? "ethereum",
    contractAddress,
    transactionLinkBase: raw.transactionLinkBase ?? "https://etherscan.io/tx/",
    jsonBaseUri: raw.jsonBaseUri,
    salesChannelId: normalizeChannelId(raw.salesChannelId),
    mintChannelId: normalizeChannelId(raw.mintChannelId),
    burnChannelId: normalizeChannelId(raw.burnChannelId),
    idCooldownMinutes: raw.idCooldownMinutes ?? 0,
    burnMessages: raw.burnMessages ?? [],
    pollIntervalMs: raw.pollIntervalMs,
  };
}

export function loadCollections(): CollectionConfig[] {
  const path = resolve(process.cwd(), env.collectionsFile);
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    collections?: RawCollection[];
  };

  if (!raw.collections?.length) {
    throw new Error(`No collections found in ${path}`);
  }

  return raw.collections.map(normalize);
}
