import { type Address, type Hex, getAddress } from "viem";
import { DEAD_ADDRESS, ZERO_ADDRESS } from "../constants";
import type { BurnEvent, MintEvent } from "../types";

/**
 * Shape of a decoded ERC721 Transfer log (as returned by viem `getLogs` with the
 * `transferEvent` ABI item). Only the fields we need are required here.
 */
export type TransferLog = {
  address: string;
  transactionHash: Hex | null;
  args: {
    from?: Address;
    to?: Address;
    tokenId?: bigint;
  };
};

/**
 * Derive mints (transfer from the zero address) and burns (transfer to the
 * zero/dead address) directly from ERC721 Transfer logs. Wallet-to-wallet
 * transfers (including the transfer leg of a marketplace sale) are ignored here;
 * sales are detected separately from marketplace events.
 */
export function parseTransfers(logs: TransferLog[]): {
  mints: MintEvent[];
  burns: BurnEvent[];
} {
  const mints: MintEvent[] = [];
  const burns: BurnEvent[] = [];

  for (const log of logs) {
    const { from, to, tokenId } = log.args;
    if (
      from === undefined ||
      to === undefined ||
      tokenId === undefined ||
      !log.transactionHash
    ) {
      continue;
    }

    const collection = getAddress(log.address);
    const id = Number(tokenId);
    const txHash = log.transactionHash;
    const fromAddr = getAddress(from);
    const toAddr = getAddress(to);

    if (fromAddr === ZERO_ADDRESS) {
      mints.push({
        type: "mint",
        collection,
        tokenId: id,
        owner: toAddr,
        txHash,
      });
    } else if (toAddr === ZERO_ADDRESS || toAddr === DEAD_ADDRESS) {
      burns.push({
        type: "burn",
        collection,
        tokenId: id,
        previousOwner: fromAddr,
        txHash,
      });
    }
  }

  return { mints, burns };
}
