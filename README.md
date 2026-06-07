# discord-salesbot

An NFT **sales / mints / burns** notifier for Discord, written in TypeScript.

- Based off Haiku's Discord sales bot and 6M's Twitter sales bot.
- Reads events directly from the chain with [viem](https://viem.sh) — no marketplace APIs required.
- Supports multiple collections, each with independent polling intervals and channels.
- **Sales** — parsed from Seaport (OpenSea) and Blur marketplace events; captures price, currency (ETH/WETH), buyer, seller, and order kind (ASK/BID).
- **Mints** — ERC721 `Transfer` from the zero address.
- **Burns** — ERC721 `Transfer` to the zero/dead address, with weighted randomized burn messages configurable per collection.
- Each embed includes ENS names, a USD price estimate (Uniswap V2 WETH/USDC pool), and the token image.

> Only **ERC721** collections on **Ethereum mainnet** are supported.

## Setup

1. Install dependencies (Node 18+ required; this repo uses Node 24):

   ```bash
   pnpm install
   ```

2. Create your `.env` from the template and fill it in:

   ```bash
   cp .env.example .env
   ```

   | Variable            | Required | Description                                                     |
   | ------------------- | -------- | --------------------------------------------------------------- |
   | `DISCORD_BOT_TOKEN` | yes      | Bot token from the Discord Developer Portal                     |
   | `RPC_URL`           | yes      | Ethereum mainnet JSON-RPC endpoint (Alchemy, Infura, …)         |
   | `LOG_LEVEL`         | no       | `NONE`/`ERROR`/`WARNING`/`SUCCESS`/`INFO`/`DEBUG` (INFO)        |
   | `POLL_INTERVAL_MS`  | no       | Default block poll interval in ms (default `60000`); overridable per collection |
   | `COLLECTIONS_FILE`  | no       | Path to collections config (default `collections.json`)         |
   | `BACKFILL_FROM`     | no       | First-run start point: block number or date (e.g. `2026-03-24`) |
   | `STATE_FILE`        | no       | Checkpoint/dedup log path (default `state.json`)                |
   | `LOG_BLOCK_CHUNK`   | no       | Blocks per request while catching up (default `2000`)           |
   | `POST_COOLDOWN_MS`  | no       | Min delay between Discord posts (default `1500`)                |

3. Configure your collections in `collections.json` (see below).

## Configuration

`collections.json` holds an array of collections to watch:

```jsonc
{
  "collections": [
    {
      "name": "Yumemono",
      "chain": "ethereum",
      "contractAddress": "0x7011EE079F579EB313012BDdb92fd6F06FA43335",
      "transactionLinkBase": "https://etherscan.io/tx/",
      "jsonBaseUri": "https://metadata.yumemono.com/json", // optional; falls back to on-chain tokenURI
      "salesChannelId": "123…",
      "mintChannelId": "123…",
      "burnChannelId": "123…",
      "pollIntervalMs": 30000, // optional; overrides POLL_INTERVAL_MS for this collection
      "idCooldownMinutes": 0, // optional anti-spam: suppress repeat sale posts for the same token
      "burnMessages": [
        { "weight": 1.0, "message": "{tokenName} has been burned!" },
      ],
    },
  ],
}
```

- Channel IDs are Discord snowflakes (strings). Omit a channel to skip that event type for the collection. The same channel may be reused for all three.
- `jsonBaseUri` is optional — when present the bot fetches `${jsonBaseUri}/${tokenId}` for the name/image; otherwise it reads `tokenURI` on-chain.
- `{tokenName}` in `burnMessages` is replaced with the token's display name.

The Discord bot must be invited to your server with permission to **View Channel** and **Send Messages / Embed Links** in the target channels.

## Running

```bash
pnpm start            # normal (INFO)
pnpm start:debug      # verbose (DEBUG)
pnpm start:quiet      # errors only
pnpm dev              # watch mode (restarts on change)
```

## Backfill & resume (the state log)

The bot keeps a persistent checkpoint in `state.json`: the last block it fully processed, plus a rolling log of recently posted events (by event + token + tx
hash). It is written after every chunk of blocks. 

On startup it decides where to begin, in this order:

1. **`state.json` exists** → resume from `lastProcessedBlock + 1`. Any blocks mined while the bot was down are caught up automatically.
2. **No state, but `BACKFILL_FROM` is set** → start from that block/date and catch up to the chain tip. Use this to recover missed sales, e.g.
   `BACKFILL_FROM=2026-03-24`.
3. **Neither** → start live from the current block (no historical posts).

Catch-up runs in chunks of `LOG_BLOCK_CHUNK` blocks. Every detected event is posted (subject to the throttle below), and posts are deduped against the state log, so restarting mid-backfill won't double-post.

> Because `BACKFILL_FROM` is ignored once `state.json` exists, a backfill runs exactly once. To re-run one, delete `state.json` first.

### Throttling

Posts are sent **sequentially** with a `POST_COOLDOWN_MS` gap (default 1.5s), so a backfill of several hundred sales drips out instead of flooding the channel or tripping Discord rate limits. At the default, ~40 posts/minute. Raise the value to slow it down further.

## Running as a systemd service (Linux)

A unit file is included at `discord-salesbot.service`. To install it:

```bash
# 1. Create a dedicated user and deploy the project
sudo useradd -r -s /usr/sbin/nologin salesbot
sudo mkdir -p /opt/discord-salesbot
sudo cp -r . /opt/discord-salesbot
sudo chown -R salesbot:salesbot /opt/discord-salesbot

# 2. Install dependencies as the service user
sudo -u salesbot pnpm install --prod --dir /opt/discord-salesbot

# 3. Copy your .env
sudo cp .env /opt/discord-salesbot/.env
sudo chown salesbot:salesbot /opt/discord-salesbot/.env
sudo chmod 600 /opt/discord-salesbot/.env

# 4. Install and start the service
sudo cp discord-salesbot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now discord-salesbot
```

Check status and logs:

```bash
sudo systemctl status discord-salesbot
sudo journalctl -u discord-salesbot -f
```

The service restarts automatically on crash with a 10-second backoff. `state.json`
persists in the working directory across restarts, so backfill and dedup work as normal.

## Development

```bash
pnpm typecheck        # tsc --noEmit
pnpm format           # prettier --write .
```

### Verifying sale parsing against a real tx

```bash
pnpm exec tsx tests/parse-tx.ts <txHash> [rpcUrl]
```

Prints the sales that would be detected in a given transaction (useful for
checking Seaport/Blur parsing without running the Discord bot).
