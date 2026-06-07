import { getAddress } from "viem";

// Marketplace exchange contracts (Ethereum mainnet)
export const SEAPORT_ADDRESS = getAddress(
  "0x0000000000000068F116a894984e2DB1123eB395",
);
export const BLUR_2_ADDRESS = getAddress(
  "0x39da41747a83aeE658334415666f3EF92DD0D541",
);
export const BLUR_3_ADDRESS = getAddress(
  "0xb2ecfE4E4D61f8790bbb9DE2D1259B9e2410CEA5",
);

// Payment tokens / pricing
export const WETH_ADDRESS = getAddress(
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
);
export const USDC_ADDRESS = getAddress(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
);
export const UNISWAP_V2_WETH_USDC_POOL = getAddress(
  "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
);

// Mint/burn sentinels
export const ZERO_ADDRESS = getAddress(
  "0x0000000000000000000000000000000000000000",
);
export const DEAD_ADDRESS = getAddress(
  "0x000000000000000000000000000000000000dEaD",
);
