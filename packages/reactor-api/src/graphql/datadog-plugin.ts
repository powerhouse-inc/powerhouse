/**
 * Apollo Server Plugin for Datadog APM Tracing
 *
 * This plugin creates spans for GraphQL operations and adds relevant tags
 * for better observability in Datadog APM.
 */

import type { ApolloServerPlugin, GraphQLRequestListener } from "@apollo/server";
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
    async requestDidStart(requestContext): Promise<GraphQLRequestListener<Context>> {
      const tracer = getTracer();
      if (!tracer) {
        return {};
      }

      const span = tracer.scope().active();

      // Add GraphQL-specific tags to the current span
      if (span) {
        const operationName = requestContext.request.operationName;
        if (operationName) {
          span.setTag("graphql.operation.name", operationName);
        }

        // Add user context if available
        const user = requestContext.contextValue?.user;
        if (user?.address) {
          span.setTag("user.address", user.address);
        }

        // Add drive context if available
        const driveId = requestContext.contextValue?.driveId;
        if (driveId) {
          span.setTag("graphql.drive_id", driveId);
        }
      }

      return {
        async didResolveOperation(context) {
          if (span && context.operation) {
            span.setTag("graphql.operation.type", context.operation.operation);
            if (context.operationName) {
              span.setTag("graphql.operation.name", context.operationName);
            }
          }
        },

        async executionDidStart() {
          return {
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
          };
        },

        async didEncounterErrors(context) {
          if (span && context.errors?.length) {
            span.setTag("error", true);
            span.setTag("graphql.errors.count", context.errors.length);

            // Log the first error message
            const firstError = context.errors[0];
            if (firstError) {
              span.setTag("error.message", firstError.message);
              if (firstError.extensions?.code) {
                span.setTag("error.code", String(firstError.extensions.code));
              }
            }
          }
        },

        async willSendResponse(context) {
          if (span) {
            // Add response metadata
            const responseSize = JSON.stringify(context.response.body).length;
            span.setTag("graphql.response.size", responseSize);
          }
        },
      };
    },
  };
}
