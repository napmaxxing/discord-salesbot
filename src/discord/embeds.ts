import { Colors, EmbedBuilder } from "discord.js";
import { type PublicClient, formatEther } from "viem";
import { formatAddress } from "../ens";
import { type TokenMeta, getTokenMeta } from "../metadata";
import { getEthPriceInUsd } from "../price";
import type {
  BurnEvent,
  BurnMessage,
  CollectionConfig,
  MintEvent,
  SaleEvent,
} from "../types";

const FOOTER = "✦ ⋆ Powered by Yumemono ☆ 夢物 ⋆ ✦";

function displayName(
  meta: TokenMeta,
  collection: CollectionConfig,
  tokenId: number,
): string {
  const name = meta.name?.trim();
  if (name && name.toLowerCase() !== "none" && name !== "???") {
    return name;
  }
  return `${collection.name} #${tokenId}`;
}

function txField(collection: CollectionConfig, txHash: string) {
  return {
    name: "Transaction",
    value: `[View on Explorer](${collection.transactionLinkBase}${txHash})`,
    inline: false,
  };
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pickBurnMessage(messages: BurnMessage[], tokenName: string): string {
  const list =
    messages.length > 0
      ? messages
      : [{ weight: 1, message: "{tokenName} has been burned!" }];

  const total = list.reduce((sum, item) => sum + item.weight, 0);
  const r = Math.random() * total;
  let cumulative = 0;
  for (const item of list) {
    cumulative += item.weight;
    if (r < cumulative)
      return item.message.replaceAll("{tokenName}", tokenName);
  }
  return list[list.length - 1].message.replaceAll("{tokenName}", tokenName);
}

export async function buildSaleEmbed(
  sale: SaleEvent,
  collection: CollectionConfig,
  publicClient: PublicClient,
): Promise<EmbedBuilder> {
  const [meta, seller, buyer, ethUsd] = await Promise.all([
    getTokenMeta({ publicClient, collection, tokenId: sale.tokenId }),
    formatAddress(publicClient, sale.seller),
    formatAddress(publicClient, sale.buyer),
    getEthPriceInUsd(publicClient),
  ]);

  const nativeStr = formatEther(sale.price);
  const usd = ethUsd > 0 ? Number(nativeStr) * ethUsd : 0;
  const priceValue =
    `${nativeStr} ${sale.currency}` +
    (usd > 0 ? ` ($${formatUsd(usd)} USD)` : "");

  const embed = new EmbedBuilder()
    .setTitle(`${displayName(meta, collection, sale.tokenId)} has been sold!!!`)
    // Yellow for an accepted bid, blue for a bought listing (matches old bot).
    .setColor(sale.orderKind === "BID" ? Colors.Yellow : Colors.Blue)
    .addFields(
      { name: "Price", value: priceValue, inline: false },
      { name: "Seller", value: seller, inline: true },
      { name: "Buyer", value: buyer, inline: true },
      txField(collection, sale.txHash),
    )
    .setFooter({ text: FOOTER });

  if (meta.imageUrl) embed.setImage(meta.imageUrl);
  return embed;
}

export async function buildMintEmbed(
  mint: MintEvent,
  collection: CollectionConfig,
  publicClient: PublicClient,
): Promise<EmbedBuilder> {
  const [meta, owner] = await Promise.all([
    getTokenMeta({ publicClient, collection, tokenId: mint.tokenId }),
    formatAddress(publicClient, mint.owner),
  ]);

  const embed = new EmbedBuilder()
    .setTitle(`${displayName(meta, collection, mint.tokenId)} just minted!`)
    .setColor(Colors.Green)
    .addFields(
      { name: "Owner", value: owner, inline: true },
      txField(collection, mint.txHash),
    )
    .setFooter({ text: FOOTER });

  if (meta.imageUrl) embed.setImage(meta.imageUrl);
  return embed;
}

export async function buildBurnEmbed(
  burn: BurnEvent,
  collection: CollectionConfig,
  publicClient: PublicClient,
): Promise<EmbedBuilder> {
  const [meta, previousOwner] = await Promise.all([
    getTokenMeta({ publicClient, collection, tokenId: burn.tokenId }),
    formatAddress(publicClient, burn.previousOwner),
  ]);

  const title = pickBurnMessage(
    collection.burnMessages,
    displayName(meta, collection, burn.tokenId),
  );

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(Colors.Red)
    .addFields(
      { name: "Previous Owner", value: previousOwner, inline: true },
      txField(collection, burn.txHash),
    )
    .setFooter({ text: FOOTER });

  if (meta.imageUrl) embed.setImage(meta.imageUrl);
  return embed;
}
