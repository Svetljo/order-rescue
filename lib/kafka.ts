import "server-only";

import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { RestaurantRescueAlert } from "@/types/restaurant-rescue";

export const RESCUE_ALERTS_TOPIC = "restaurant_rescue_alerts";

const SNAPSHOT_TIMEOUT_MS = 5_000;
const SNAPSHOT_MAX_RECORDS = 100;

type KafkaRecord = Record<string, unknown>;

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required Kafka environment variable: ${name}`);
  }

  return value;
}

export function createRescueAlertsConsumer(
  groupId: string,
  offsetReset: "earliest" | "latest" = "earliest",
) {
  return new KafkaJS.Kafka().consumer({
    "bootstrap.servers": requiredEnvironmentVariable("KAFKA_BROKERS"),
    "security.protocol": "sasl_ssl",
    "sasl.mechanisms": "PLAIN",
    "sasl.username": requiredEnvironmentVariable("KAFKA_API_KEY"),
    "sasl.password": requiredEnvironmentVariable("KAFKA_API_SECRET"),
    "group.id": groupId,
    "auto.offset.reset": offsetReset,
    "enable.auto.commit": false,
  });
}

function isKafkaRecord(value: unknown): value is KafkaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHealthStatus(value: unknown): value is RestaurantRescueAlert["health_status"] {
  return (
    value === "CRITICAL" ||
    value === "HIGH" ||
    value === "WARNING" ||
    value === "HEALTHY"
  );
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function decodeRescueAlert(value: Buffer | null): RestaurantRescueAlert | null {
  if (!value) {
    return null;
  }

  const payload = value[0] === 0 ? value.subarray(5) : value;

  try {
    let decoded: unknown = JSON.parse(payload.toString("utf8"));

    if (typeof decoded === "string") {
      decoded = JSON.parse(decoded);
    }

    if (
      !isKafkaRecord(decoded) ||
      typeof decoded.restaurant_id !== "string" ||
      typeof decoded.restaurant_name !== "string" ||
      !isNumber(decoded.prep_time_min) ||
      !isNumber(decoded.baseline_prep_time_min) ||
      !isNumber(decoded.active_orders) ||
      !isNumber(decoded.couriers_waiting) ||
      !isNumber(decoded.prep_ratio) ||
      !isNumber(decoded.rescue_score) ||
      !isHealthStatus(decoded.health_status)
    ) {
      return null;
    }

    return {
      restaurant_id: decoded.restaurant_id,
      restaurant_name: decoded.restaurant_name,
      prep_time_min: decoded.prep_time_min,
      baseline_prep_time_min: decoded.baseline_prep_time_min,
      active_orders: decoded.active_orders,
      couriers_waiting: decoded.couriers_waiting,
      prep_ratio: decoded.prep_ratio,
      rescue_score: decoded.rescue_score,
      health_status: decoded.health_status,
    };
  } catch (error) {
    console.warn("Ignoring unreadable restaurant rescue alert", {
      error: error instanceof Error ? error.name : "Unknown error",
    });
    return null;
  }
}

/**
 * Reads a small, current snapshot from Kafka. This stable group never commits
 * offsets, so each short-lived Vercel invocation replays the same bounded
 * topic window and can reduce it to the latest observed state per restaurant.
 */
export async function getLatestRescueAlerts(): Promise<RestaurantRescueAlert[]> {
  const consumer = createRescueAlertsConsumer(
    "order-rescue-dashboard-snapshot-v1",
    "earliest",
  );
  const alertsByRestaurant = new Map<string, RestaurantRescueAlert>();
  let connected = false;
  let receivedRecords = 0;
  let resolveCollection: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const collectionComplete = new Promise<void>((resolve) => {
    resolveCollection = resolve;
  });

  try {
    await consumer.connect();
    connected = true;
    await consumer.subscribe({ topics: [RESCUE_ALERTS_TOPIC] });
    await consumer.run({
      eachMessage: async ({ message }) => {
        receivedRecords += 1;
        const alert = decodeRescueAlert(message.value);

        if (alert) {
          // Kafka preserves a keyed restaurant's update order within its partition.
          alertsByRestaurant.set(alert.restaurant_id, alert);
        }

        if (receivedRecords >= SNAPSHOT_MAX_RECORDS) {
          resolveCollection?.();
        }
      },
    });
    timeout = setTimeout(() => resolveCollection?.(), SNAPSHOT_TIMEOUT_MS);
    await collectionComplete;

    return [...alertsByRestaurant.values()].sort(
      (first, second) => second.rescue_score - first.rescue_score,
    );
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }

    if (connected) {
      await consumer.stop().catch((error: unknown) => {
        console.error("Kafka consumer stop failed", {
          error: error instanceof Error ? error.name : "Unknown error",
        });
      });
      await consumer.disconnect().catch((error: unknown) => {
        console.error("Kafka consumer disconnect failed", {
          error: error instanceof Error ? error.name : "Unknown error",
        });
      });
    }
  }
}
