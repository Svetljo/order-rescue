import { createRescueAlertsConsumer, RESCUE_ALERTS_TOPIC } from "@/lib/kafka";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const consumer = createRescueAlertsConsumer(
    `order-rescue-verification-${crypto.randomUUID()}`,
  );
  let connected = false;
  let stage = "connecting";

  try {
    const message = await new Promise<Buffer | null>(async (resolve, reject) => {
      const timeout = setTimeout(() => resolve(null), 25_000);

      try {
        await consumer.connect();
        connected = true;
        stage = "subscribing";
        await consumer.subscribe({ topics: [RESCUE_ALERTS_TOPIC] });
        stage = "consuming";
        await consumer.run({
          eachMessage: async ({ message: kafkaMessage }) => {
            clearTimeout(timeout);
            resolve(kafkaMessage.value);
          },
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });

    if (!message) {
      return Response.json({
        ok: true,
        connected: true,
        topic: RESCUE_ALERTS_TOPIC,
        messageReceived: false,
      });
    }

    const payload = message[0] === 0 ? message.subarray(5) : message;
    const text = payload.toString("utf8");
    let decoded: unknown;

    try {
      decoded = JSON.parse(text);
      if (typeof decoded === "string") {
        decoded = JSON.parse(decoded);
      }
    } catch (error) {
      console.error("Kafka record decoding failed", {
        length: payload.length,
        schemaRegistryFramed: message[0] === 0,
        error: error instanceof Error ? error.name : "Unknown error",
      });
      throw error;
    }

    const value = decoded as {
      restaurant_id?: string;
      restaurant_name?: string;
      rescue_score?: number;
      health_status?: string;
    };

    return Response.json({
      ok: true,
      connected: true,
      topic: RESCUE_ALERTS_TOPIC,
      messageReceived: true,
      record: {
        restaurant_id: value.restaurant_id,
        restaurant_name: value.restaurant_name,
        rescue_score: value.rescue_score,
        health_status: value.health_status,
      },
    });
  } catch (error) {
    console.error("Kafka connectivity test failed", {
      connected,
      stage,
      error: error instanceof Error ? error.name : "Unknown error",
    });

    return Response.json(
      {
        ok: false,
        connected: false,
        error: "Kafka connection failed",
      },
      { status: 500 },
    );
  } finally {
    if (connected) {
      await consumer.disconnect().catch((error: unknown) => {
        console.error("Kafka consumer disconnect failed", {
          error: error instanceof Error ? error.name : "Unknown error",
        });
      });
    }
  }
}
