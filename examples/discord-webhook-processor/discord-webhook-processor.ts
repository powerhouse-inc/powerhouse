import { createHmac } from "node:crypto";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  ProcessorFactory,
  ProcessorFilter,
} from "@powerhousedao/shared/processors";

const DISCORD_MAX_EMBEDS = 10;

type DiscordEmbed = {
  title: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  timestamp: string;
};

type DiscordWebhookPayload = {
  username?: string;
  embeds: DiscordEmbed[];
};

function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function operationToEmbed(op: OperationWithContext): DiscordEmbed {
  const { operation, context } = op;
  const input = JSON.stringify(operation.action.input);
  const truncatedInput =
    input.length > 1024 ? input.slice(0, 1021) + "..." : input;

  return {
    title: `${operation.action.type}`,
    color: 0x5865f2, // Discord blurple
    fields: [
      { name: "Document ID", value: context.documentId, inline: true },
      { name: "Document Type", value: context.documentType, inline: true },
      { name: "Scope", value: context.scope, inline: true },
      { name: "Branch", value: context.branch, inline: true },
      { name: "Hash", value: operation.hash || "—", inline: true },
      { name: "Input", value: truncatedInput },
    ],
    timestamp: new Date(Number(operation.timestampUtcMs)).toISOString(),
  };
}

/**
 * A Reactor processor that forwards operations to a Discord webhook as embeds.
 *
 * Each operation becomes a Discord embed with document metadata and action details.
 * Batches of >10 operations are chunked into multiple requests (Discord's embed limit).
 * An HMAC-SHA256 signature is included in the X-Reactor-Signature header.
 */
export class DiscordWebhookProcessor implements IProcessor {
  constructor(
    private webhookUrl: string,
    private secret: string,
  ) {}

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    const embeds = operations.map(operationToEmbed);

    // Discord allows max 10 embeds per message — chunk if needed
    for (let i = 0; i < embeds.length; i += DISCORD_MAX_EMBEDS) {
      const chunk = embeds.slice(i, i + DISCORD_MAX_EMBEDS);

      const payload: DiscordWebhookPayload = {
        username: "Reactor",
        embeds: chunk,
      };

      const body = JSON.stringify(payload);
      const signature = signPayload(this.secret, body);

      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Reactor-Signature": signature,
        },
        body,
      });

      if (!response.ok) {
        throw new Error(
          `Discord webhook failed: ${response.status} ${response.statusText}`,
        );
      }
    }
  }

  async onDisconnect(): Promise<void> {
    // no resources to clean up
  }
}

/**
 * Creates a ProcessorFactory that produces a DiscordWebhookProcessor
 * with the given configuration.
 *
 * @example
 * ```ts
 * await processorManager.registerFactory(
 *   "discord-webhook",
 *   createDiscordWebhookFactory({
 *     webhookUrl: "https://discord.com/api/webhooks/{id}/{token}",
 *     secret: process.env.WEBHOOK_SECRET!,
 *     filter: {
 *       documentType: ["powerhouse/billing-statement"],
 *       scope: ["global"],
 *       branch: ["main"],
 *     },
 *   }),
 * );
 * ```
 */
export function createDiscordWebhookFactory(config: {
  webhookUrl: string;
  secret: string;
  filter: ProcessorFilter;
}): ProcessorFactory {
  return () => [
    {
      processor: new DiscordWebhookProcessor(config.webhookUrl, config.secret),
      filter: config.filter,
      startFrom: "current",
    },
  ];
}
