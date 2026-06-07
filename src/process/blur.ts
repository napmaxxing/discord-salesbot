import {
  type Address,
  type Hex,
  type Log,
  bytesToHex,
  decodeEventLog,
  erc20Abi,
  getAddress,
  hexToBigInt,
  slice,
  toBytes,
} from "viem";
import { blurV2Abi } from "../abi/blur";
import { BLUR_2_ADDRESS, BLUR_3_ADDRESS } from "../constants";
import logger from "../logger";
import type { OrderKind, SaleEvent } from "../types";

// OrderType enum: 0 = ASK (seller listing), 1 = BID (buyer offer)
enum OrderType {
  ASK = 0,
  BID = 1,
}

const BLUR_ADDRESSES = new Set<Address>([BLUR_2_ADDRESS, BLUR_3_ADDRESS]);

/** Unpacks Blur's packed execution data from a single event. */
function unpack(args: {
  collectionPriceSide: bigint;
  tokenIdListingIndexTrader: bigint;
}): {
  orderType: number;
  price: bigint;
  collection: Address;
  tokenId: bigint;
  trader: Address;
} {
  const collectionPriceBytes = toBytes(args.collectionPriceSide, { size: 32 });
  const orderType = Number(collectionPriceBytes[0]); // first byte
  const priceBytes = slice(collectionPriceBytes, 1, 12); // next 11 bytes
  const collectionBytes = slice(collectionPriceBytes, 12, 32); // last 20 bytes

  const price = hexToBigInt(bytesToHex(priceBytes));
  const collection = getAddress(bytesToHex(collectionBytes));

  const tokenTraderBytes = toBytes(args.tokenIdListingIndexTrader, {
    size: 32,
  });
  const tokenIdBytes = slice(tokenTraderBytes, 0, 11); // first 11 bytes
  const traderBytes = slice(tokenTraderBytes, 12, 32); // last 20 bytes

  const tokenId = hexToBigInt(bytesToHex(tokenIdBytes));
  const trader = getAddress(bytesToHex(traderBytes));

  return { orderType, price, collection, tokenId, trader };
}

/**
 * Find the counterparty of a Blur trade by inspecting the NFT Transfer logs for
 * the relevant collection. The trader is one side; the counterparty is whoever
 * is on the other end of the transfer.
 */
function findCounterparty({
  trader,
  collection,
  logs,
}: {
  trader: Address;
  collection: Address;
  logs: Log[];
}): Address | undefined {
  for (const log of logs) {
    try {
      if (getAddress(log.address) !== collection) continue;

      const decoded = decodeEventLog({
        abi: erc20Abi,
        strict: false,
        eventName: "Transfer",
        ...log,
      });

      const { from, to } = decoded.args;
      if (from === undefined || to === undefined) continue;

      if (getAddress(from) === trader) return getAddress(to);
      if (getAddress(to) === trader) return getAddress(from);
    } catch {
      // Not a Transfer log; skip.
    }
  }
  return undefined;
}

/**
 * Parse Blur execution events from a transaction's logs and return the NFT
 * sales that involve one of the watched collections.
 */
export function parseBlurEvents({
  logs,
  watched,
}: {
  logs: Log[];
  watched: Set<Address>;
}): SaleEvent[] {
  const sales: SaleEvent[] = [];

  for (const log of logs) {
    try {
      if (!BLUR_ADDRESSES.has(getAddress(log.address))) continue;

      const decoded = decodeEventLog({ abi: blurV2Abi, ...log });
      const { eventName } = decoded;

      if (
        eventName !== "Execution721Packed" &&
        eventName !== "Execution721TakerFeePacked" &&
        eventName !== "Execution721MakerFeePacked"
      ) {
        continue;
      }

      const { collectionPriceSide, tokenIdListingIndexTrader } = decoded.args;
      const { orderType, price, collection, tokenId, trader } = unpack({
        collectionPriceSide,
        tokenIdListingIndexTrader,
      });

      if (!watched.has(collection)) continue;

      const counterparty = findCounterparty({ trader, collection, logs });
      if (!counterparty) {
        logger.warn(
          `Blur trade for ${collection} #${tokenId}: no counterparty found in logs`,
        );
        continue;
      }

      const orderKind: OrderKind = orderType === OrderType.ASK ? "ASK" : "BID";
      const [seller, buyer] =
        orderType === OrderType.ASK
          ? [trader, counterparty]
          : [counterparty, trader];

      sales.push({
        type: "sale",
        collection,
        tokenId: Number(tokenId),
        seller,
        buyer,
        price,
        currency: "ETH",
        orderKind,
        marketplace: "Blur",
        txHash: log.transactionHash as Hex,
      });
    } catch (error) {
      logger.debug("Error processing Blur event", error);
    }
  }

  return sales;
}
