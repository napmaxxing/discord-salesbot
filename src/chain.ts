import { http, createPublicClient } from "viem";
import { mainnet } from "viem/chains";
import { env } from "./config";

export const publicClient = createPublicClient({
  transport: http(env.rpcUrl),
  chain: mainnet,
});

export type AppPublicClient = typeof publicClient;
