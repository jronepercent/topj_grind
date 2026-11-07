import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

export const loggerProvider = projectToken && host
  ? new LoggerProvider({
      resource: resourceFromAttributes({ "service.name": "topjgrind" }),
      processors: [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: `${host}/i/v1/logs`,
            headers: {
              Authorization: `Bearer ${projectToken}`,
              "Content-Type": "application/json",
            },
          }),
        }),
      ],
    })
  : null;

export const posthogLogger = loggerProvider?.getLogger("topjgrind.posthog") ?? null;

export function register() {
  if (!projectToken && process.env.NODE_ENV !== "production") {
    console.warn("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured");
  }
  if (!host && process.env.NODE_ENV !== "production") {
    console.warn("NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured");
  }
}

export function flushPostHogLogs() {
  return loggerProvider?.forceFlush().catch(() => {});
}
