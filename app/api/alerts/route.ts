import { getLatestRescueAlerts } from "@/lib/kafka";
import type { RestaurantRescueAlertsResponse } from "@/types/restaurant-rescue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET() {
  try {
    const response: RestaurantRescueAlertsResponse = {
      alerts: await getLatestRescueAlerts(),
    };

    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Restaurant rescue alerts retrieval failed", {
      error: error instanceof Error ? error.name : "Unknown error",
    });

    return Response.json(
      { error: "Unable to retrieve restaurant alerts. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
