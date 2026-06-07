import {
  type Address,
  type Hex,
  type Log,
  decodeEventLog,
  formatEther,
  getAddress,
} from "viem";
import { seaportAbi } from "../abi/seaport";
import { WETH_ADDRESS } from "../constants";
import logger from "../logger";
import type { Currency, OrderKind, SaleEvent } from "../types";

// ItemType enum in Seaport: 0 = native (ETH), 1 = ERC20, 2 = ERC721, 3 = ERC1155
const ITEM_TYPE = {
  ETH: 0,
  ERC20: 1,
  ERC721: 2,
} as const;

type PaymentItem = { amount: bigint };
type NftItem = { identifier: bigint; token: string };

/**
 * Parse Seaport (OpenSea) `OrderFulfilled` events from a transaction's logs and
 * return the NFT sales that involve one of the watched collections.
 */
export function parseSeaportEvents({
  logs,
  watched,
}: {
  logs: Log[];
  watched: Set<Address>;
}): SaleEvent[] {
  // Dedupe by tokenId+tx so fee distributions don't create duplicate sales.
  const uniqueSales = new Map<string, SaleEvent>();

  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: seaportAbi,
        eventName: "OrderFulfilled",
        ...log,
      });

      const { offerer, recipient, offer, consideration } = decoded.args;
      const txHash = log.transactionHash as Hex;

      const offerNfts = offer.filter(
        (item) =>
          item.itemType === ITEM_TYPE.ERC721 &&
          watched.has(getAddress(item.token)),
      );
      const considerationNfts = consideration.filter(
        (item) =>
          item.itemType === ITEM_TYPE.ERC721 &&
          watched.has(getAddress(item.token)),
      );

      if (!offerNfts.length && !considerationNfts.length) continue;

      const ethPayments = consideration.filter(
        (item) => item.itemType === ITEM_TYPE.ETH,
      );
      const wethPayments = consideration.filter(
        (item) =>
          item.itemType === ITEM_TYPE.ERC20 &&
          getAddress(item.token) === WETH_ADDRESS,
      );

      // Case 1: NFTs in offer, ETH in consideration (standard listing sale)
      if (offerNfts.length > 0 && ethPayments.length > 0) {
        record(
          offerNfts,
          sumPayments(ethPayments),
          offerer,
          recipient,
          txHash,
          "ETH",
          "ASK",
          uniqueSales,
        );
      }

      // Case 2: NFTs in offer, WETH in consideration
      if (offerNfts.length > 0 && wethPayments.length > 0) {
        record(
          offerNfts,
          sumPayments(wethPayments),
          offerer,
          recipient,
          txHash,
          "WETH",
          "ASK",
          uniqueSales,
        );
      }

      // Case 3: ETH/WETH in offer, NFTs in consideration (accepted bid)
      if (considerationNfts.length > 0) {
        const ethOffers = offer.filter(
          (item) => item.itemType === ITEM_TYPE.ETH,
        );
        const wethOffers = offer.filter(
          (item) =>
            item.itemType === ITEM_TYPE.ERC20 &&
            getAddress(item.token) === WETH_ADDRESS,
        );

        const ethAmount = sumPayments(ethOffers);
        const wethAmount = sumPayments(wethOffers);
        const total = ethAmount > 0n ? ethAmount : wethAmount;
        const currency: Currency = ethAmount > 0n ? "ETH" : "WETH";

        if (total > 0n) {
          // Buyer and seller are reversed in this direction.
          record(
            considerationNfts,
            total,
            recipient,
            offerer,
            txHash,
            currency,
            "BID",
            uniqueSales,
          );
        }
      }
    } catch {
      // Not a Seaport OrderFulfilled log; skip silently.
    }
  }

  return Array.from(uniqueSales.values());
}

function sumPayments(items: PaymentItem[]): bigint {
  let total = 0n;
  for (const item of items) total += item.amount;
  return total;
}

function record(
  nfts: NftItem[],
  totalAmount: bigint,
  seller: Address,
  buyer: Address,
  txHash: Hex,
  currency: Currency,
  orderKind: OrderKind,
  salesMap: Map<string, SaleEvent>,
): void {
  for (const nft of nfts) {
    const pricePerNft =
      nfts.length > 1 ? totalAmount / BigInt(nfts.length) : totalAmount;
    const collection = getAddress(nft.token);
    const tokenId = Number(nft.identifier);
    const key = `${collection}-${tokenId}-${txHash}`;

    const sale: SaleEvent = {
      type: "sale",
      collection,
      tokenId,
      seller: getAddress(seller),
      buyer: getAddress(buyer),
      price: pricePerNft,
      currency,
      orderKind,
      marketplace: "OpenSea",
      txHash,
    };

    const existing = salesMap.get(key);
    if (!existing || existing.price < pricePerNft) {
      salesMap.set(key, sale);
      logger.debug(
        `Seaport ${orderKind} sale: ${collection} #${tokenId} for ${formatEther(pricePerNft)} ${currency}`,
      );
    }
  }
}
