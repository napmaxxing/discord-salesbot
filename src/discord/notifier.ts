import type { Client, EmbedBuilder } from "discord.js";
import type { Address, PublicClient } from "viem";
import logger from "../logger";
import type { CollectionConfig, NftEvent } from "../types";
import { buildBurnEmbed, buildMintEmbed, buildSaleEmbed } from "./embeds";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fingerprint(event: NftEvent): string {
  return `${event.type}-${event.collection}-${event.tokenId}-${event.txHash}`;
}

export type NotifierOptions = {
  /** Minimum delay between posts (ms). Throttles backfill bursts. */
  cooldownMs?: number;
  /** Previously seen fingerprints, restored from the state log. */
  seen?: string[];
};

/**
 * Posts NFT events to Discord sequentially with a cooldown, deduping by
 * fingerprint and applying an optional per-token sale cooldown. `postEvents`
 * resolves only once every event has been handled, so callers can safely
 * advance their checkpoint afterwards.
 */
export class Notifier {
  private readonly cooldownMs: number;
  private readonly seen: Set<string>;
  private readonly tokenCooldowns = new Map<string, number>();
  private lastSentAt = 0;

  constructor(
    private readonly client: Client,
    private readonly publicClient: PublicClient,
    private readonly collections: Map<Address, CollectionConfig>,
    options: NotifierOptions = {},
  ) {
    this.cooldownMs = options.cooldownMs ?? 1_500;
    this.seen = new Set(options.seen ?? []);
  }

  /** Fingerprints of everything handled so far (for persisting to the state log). */
  getSeen(): string[] {
    return Array.from(this.seen);
  }

  async postEvents(events: NftEvent[]): Promise<void> {
    for (const event of events) {
      const fp = fingerprint(event);
      if (this.seen.has(fp)) continue;

      const wait = Math.max(
        0,
        this.cooldownMs - (Date.now() - this.lastSentAt),
      );
      if (wait > 0) await sleep(wait);

      try {
        const posted = await this.handle(event);
        if (posted) this.lastSentAt = Date.now();
      } catch (error) {
        logger.error(
          `Failed to post ${event.type} for #${event.tokenId} (${event.txHash})`,
          error,
        );
      }

      // Mark handled regardless of outcome so we don't retry/duplicate it.
      this.seen.add(fp);
    }
  }

  /** Returns true if a message was actually sent to a channel. */
  private async handle(event: NftEvent): Promise<boolean> {
    const collection = this.collections.get(event.collection);
    if (!collection) {
      logger.debug(`No config for collection ${event.collection}; skipping`);
      return false;
    }

    // Optional anti-spam: suppress repeat sale posts for the same token.
    if (event.type === "sale" && collection.idCooldownMinutes > 0) {
      const key = `${event.collection}-${event.tokenId}`;
      const last = this.tokenCooldowns.get(key) ?? 0;
      if (Date.now() - last < collection.idCooldownMinutes * 60_000) {
        logger.info(
          `Token #${event.tokenId} is in sale cooldown; skipping post`,
        );
        return false;
      }
      this.tokenCooldowns.set(key, Date.now());
    }

    let channelId: string | undefined;
    let embed: EmbedBuilder;

    switch (event.type) {
      case "sale":
        channelId = collection.salesChannelId;
        embed = await buildSaleEmbed(event, collection, this.publicClient);
        break;
      case "mint":
        channelId = collection.mintChannelId;
        embed = await buildMintEmbed(event, collection, this.publicClient);
        break;
      case "burn":
        channelId = collection.burnChannelId;
        embed = await buildBurnEmbed(event, collection, this.publicClient);
        break;
    }

    if (!channelId) {
      logger.debug(
        `No ${event.type} channel configured for ${collection.name}; skipping`,
      );
      return false;
    }

    await this.send(channelId, embed);
    logger.success(
      `Posted ${event.type} for ${collection.name} #${event.tokenId}`,
    );
    return true;
  }

  private async send(channelId: string, embed: EmbedBuilder): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (channel?.isTextBased() && "send" in channel) {
      await channel.send({ embeds: [embed] });
    } else {
      logger.warn(`Channel ${channelId} not found or not text-based`);
    }
  }
}
