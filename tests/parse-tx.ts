// Ad-hoc verification: parse a known transaction's sales without Discord/RPC env.
// Usage: tsx tests/parse-tx.ts <txHash> [rpcUrl]
import { http, type Hex, createPublicClient, getAddress } from "viem";
import { mainnet } from "viem/chains";
import { parseBlurEvents } from "../src/process/blur";
import { parseSeaportEvents } from "../src/process/opensea";

const YUMEMONO = getAddress("0x7011EE079F579EB313012BDdb92fd6F06FA43335");

const hash = process.argv[2] as Hex;
const rpc = process.argv[3] ?? "https://eth.llamarpc.com";

if (!hash) {
  console.error("Usage: tsx tests/parse-tx.ts <txHash> [rpcUrl]");
  process.exit(1);
}

const client = createPublicClient({ transport: http(rpc), chain: mainnet });
const watched = new Set([YUMEMONO]);

const receipt = await client.getTransactionReceipt({ hash });
const sales = [
  ...parseSeaportEvents({ logs: receipt.logs, watched }),
  ...parseBlurEvents({ logs: receipt.logs, watched }),
];

console.log(`Found ${sales.length} sale(s):`);
for (const sale of sales) {
  console.log(
    JSON.stringify(
      sale,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
}
