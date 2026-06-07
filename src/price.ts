import type { PublicClient } from "viem";
import { uniswapV2PairAbi } from "./abi/uniswapV2Pair";
import { UNISWAP_V2_WETH_USDC_POOL, WETH_ADDRESS } from "./constants";
import logger from "./logger";

// Cache the ETH/USD price briefly to avoid a pool read per embed.
const CACHE_TTL_MS = 60_000;
let cachedPrice = 0;
let cachedAt = 0;

/**
 * Spot ETH price in USD, derived from the Uniswap V2 WETH/USDC pool reserves.
 * Returns 0 if the price can't be fetched.
 */
export async function getEthPriceInUsd(
  publicClient: PublicClient,
): Promise<number> {
  const now = Date.now();
  if (cachedPrice > 0 && now - cachedAt < CACHE_TTL_MS) {
    return cachedPrice;
  }

  try {
    const [reserve0, reserve1] = await publicClient.readContract({
      address: UNISWAP_V2_WETH_USDC_POOL,
      abi: uniswapV2PairAbi,
      functionName: "getReserves",
    });

    const token0 = await publicClient.readContract({
      address: UNISWAP_V2_WETH_USDC_POOL,
      abi: uniswapV2PairAbi,
      functionName: "token0",
    });

    // USDC has 6 decimals, WETH has 18 decimals.
    let wethReserve: bigint;
    let usdcReserve: bigint;
    if (token0.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
      wethReserve = reserve0;
      usdcReserve = reserve1;
    } else {
      wethReserve = reserve1;
      usdcReserve = reserve0;
    }

    // (usdcReserve / 1e6) / (wethReserve / 1e18) == usdcReserve * 1e12 / wethReserve
    const price = Number((usdcReserve * BigInt(10 ** 12)) / wethReserve);
    cachedPrice = price;
    cachedAt = now;
    logger.debug(`ETH price: $${price}`);
    return price;
  } catch (error) {
    logger.error("Failed to fetch ETH price from Uniswap V2", error);
    return cachedPrice; // fall back to last known (possibly 0)
  }
}
