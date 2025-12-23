/**
 * Apollo Server Plugin for Datadog APM Tracing
 *
 * This plugin creates spans for GraphQL operations and adds relevant tags
 * for better observability in Datadog APM.
 */

import type {
  ApolloServerPlugin,
  GraphQLRequestListener,
} from "@apollo/server";
import type { Context } from "./types.js";
import { getTracer, isTracingEnabled } from "../tracing.js";

/**
 * Creates an Apollo Server plugin that integrates with Datadog APM.
 * If tracing is not enabled, returns a no-op plugin.
 */
export function datadogTracingPlugin(): ApolloServerPlugin<Context> {
  if (!isTracingEnabled()) {
    return {};
  }

  return {
    requestDidStart(requestContext): Promise<GraphQLRequestListener<Context>> {
      const tracer = getTracer();
      if (!tracer) {
        return Promise.resolve({});
      }

      const span = tracer.scope().active();

      // Add GraphQL-specific tags to the current span
      if (span) {
        const operationName = requestContext.request.operationName;
        if (operationName) {
          span.setTag("graphql.operation.name", operationName);
        }

        // Add user context if available
        const user = requestContext.contextValue.user;
        if (user?.address) {
          span.setTag("user.address", user.address);
        }

        // Add drive context if available
        const driveId = requestContext.contextValue.driveId;
        if (driveId) {
          span.setTag("graphql.drive_id", driveId);
        }
      }

      return Promise.resolve({
        // eslint-disable-next-line @typescript-eslint/require-await
        async didResolveOperation(context) {
          if (span && context.operation) {
            span.setTag("graphql.operation.type", context.operation.operation);
            if (context.operationName) {
              span.setTag("graphql.operation.name", context.operationName);
            }
          }
        },

        async executionDidStart() {
          return Promise.resolve({
            willResolveField({ info }) {
              // Only trace root fields to avoid excessive spans
              if (info.path.prev) {
                return;
              }

              const fieldSpan = tracer.startSpan("graphql.field", {
                childOf: span ?? undefined,
                tags: {
                  "graphql.field.name": info.fieldName,
                  "graphql.field.type": info.returnType.toString(),
                  "graphql.parent.type": info.parentType.name,
                },
              });

              return (error) => {
                if (error) {
                  fieldSpan.setTag("error", true);
                  fieldSpan.setTag("error.message", error.message);
                }
                fieldSpan.finish();
              };
            },
          });
        },

        // eslint-disable-next-line @typescript-eslint/require-await
        async didEncounterErrors(context) {
          if (span && context.errors.length > 0) {
            span.setTag("error", true);
            span.setTag("graphql.errors.count", context.errors.length);

            // Log the first error message
            const firstError = context.errors[0];
            span.setTag("error.message", firstError.message);
            const errorCode = firstError.extensions.code;
            if (errorCode != null) {
              span.setTag(
                "error.code",
                typeof errorCode === "string"
                  ? errorCode
                  : JSON.stringify(errorCode),
              );
            }
          }
        },

        // eslint-disable-next-line @typescript-eslint/require-await
        async willSendResponse(context) {
          if (span) {
            // Add response metadata
            const responseSize = JSON.stringify(context.response.body).length;
            span.setTag("graphql.response.size", responseSize);
          }
        },
      });
    },
  };
}
