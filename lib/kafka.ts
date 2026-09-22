import "server-only";

import { KafkaJS } from "@confluentinc/kafka-javascript";

export const RESCUE_ALERTS_TOPIC = "restaurant_rescue_alerts";

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required Kafka environment variable: ${name}`);
  }

  return value;
}

export function createRescueAlertsConsumer(groupId: string) {
  return new KafkaJS.Kafka().consumer({
    "bootstrap.servers": requiredEnvironmentVariable("KAFKA_BROKERS"),
    "security.protocol": "sasl_ssl",
    "sasl.mechanisms": "PLAIN",
    "sasl.username": requiredEnvironmentVariable("KAFKA_API_KEY"),
    "sasl.password": requiredEnvironmentVariable("KAFKA_API_SECRET"),
    "group.id": groupId,
    "auto.offset.reset": "earliest",
  });
}
