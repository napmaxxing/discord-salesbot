import type { Address, Hex } from "viem";

export type BurnMessage = {
  weight: number;
  message: string;
};

export type CollectionConfig = {
  name: string;
  chain: string;
  contractAddress: Address;
  transactionLinkBase: string;
  /** Optional off-chain metadata base URI: `${jsonBaseUri}/${tokenId}` returns metadata JSON. Falls back to on-chain tokenURI when omitted. */
  jsonBaseUri?: string;
  salesChannelId?: string;
  mintChannelId?: string;
  burnChannelId?: string;
  /** Suppress repeat sale posts for the same token within this window (minutes). 0 disables. */
  idCooldownMinutes: number;
  burnMessages: BurnMessage[];
  /** Override the global POLL_INTERVAL_MS for this collection (ms). */
  pollIntervalMs?: number;
};

export type Currency = "ETH" | "WETH";
export type OrderKind = "ASK" | "BID";
export type Marketplace = "OpenSea" | "Blur";

export type SaleEvent = {
  type: "sale";
  collection: Address;
  tokenId: number;
  seller: Address;
  buyer: Address;
  /** Sale price in wei of `currency` (both ETH and WETH use 18 decimals). */
  price: bigint;
  currency: Currency;
  orderKind: OrderKind;
  marketplace: Marketplace;
  txHash: Hex;
};

export type MintEvent = {
  type: "mint";
  collection: Address;
  tokenId: number;
  owner: Address;
  txHash: Hex;
};

export type BurnEvent = {
  type: "burn";
  collection: Address;
  tokenId: number;
  previousOwner: Address;
  txHash: Hex;
};

export type NftEvent = SaleEvent | MintEvent | BurnEvent;
