import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "./config";
import logger from "./logger";

export type BotState = {
  /** Per-collection block checkpoints, keyed by lowercase contract address. */
  checkpoints: Record<string, bigint>;
  /** Fingerprints of recently posted events, to avoid duplicates on resume. */
  seen: string[];
  /**
   * @deprecated Global checkpoint from the pre-per-collection format.
   * Present only when migrating an existing state.json; ignored after first save.
   */
  lastProcessedBlock?: bigint | null;
};

const statePath = resolve(process.cwd(), env.stateFile);

const MAX_SEEN = 2000;

export function loadState(): BotState {
  if (!existsSync(statePath)) {
    return { checkpoints: {}, seen: [] };
  }

  try {
    const raw = JSON.parse(readFileSync(statePath, "utf8")) as {
      checkpoints?: Record<string, string>;
      lastProcessedBlock?: string | number | null;
      seen?: string[];
    };

    const checkpoints: Record<string, bigint> = {};
    for (const [addr, block] of Object.entries(raw.checkpoints ?? {})) {
      checkpoints[addr] = BigInt(block);
    }

    return {
      checkpoints,
      seen: Array.isArray(raw.seen) ? raw.seen : [],
      lastProcessedBlock:
        raw.lastProcessedBlock != null ? BigInt(raw.lastProcessedBlock) : null,
    };
  } catch (error) {
    logger.error(
      `Failed to read state file ${statePath}; starting fresh`,
      error,
    );
    return { checkpoints: {}, seen: [] };
  }
}

export function saveState(state: BotState): void {
  try {
    const checkpoints: Record<string, string> = {};
    for (const [addr, block] of Object.entries(state.checkpoints)) {
      checkpoints[addr] = block.toString();
    }
    const data = {
      checkpoints,
      seen: state.seen.slice(-MAX_SEEN),
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(statePath, JSON.stringify(data, null, 2));
  } catch (error) {
    logger.error(`Failed to write state file ${statePath}`, error);
  }
}
