import { Client, Events, GatewayIntentBits } from "discord.js";
import { env } from "../config";
import logger from "../logger";

// Only the Guilds intent is needed to fetch channels and post messages.
export const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/** Log the bot in and resolve once it's ready. */
export function startBot(): Promise<Client> {
  return new Promise((resolve, reject) => {
    client.once(Events.ClientReady, (readyClient) => {
      logger.success(`Discord bot logged in as ${readyClient.user.tag}`);
      resolve(readyClient);
    });

    client.once(Events.Error, reject);

    client.login(env.discordToken).catch(reject);
  });
}
