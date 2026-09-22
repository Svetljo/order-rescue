"use client";

import { useEffect, useState } from "react";
import type {
  HealthStatus,
  RestaurantRescueAlert,
  RestaurantRescueAlertsResponse,
} from "@/types/restaurant-rescue";

const POLLING_INTERVAL_MS = 5_000;

type DashboardState = "loading" | "ready" | "error";

const statusOrder: Record<HealthStatus, number> = {
  CRITICAL: 0,
  HIGH: 0,
  WARNING: 1,
  HEALTHY: 2,
};

const pipelineStages = [
  {
    label: "Restaurant Events",
    value: "restaurant_events_v2",
    detailLabel: "Source",
    detail: "Datagen",
    description: "Contains restaurant preparation and order activity.",
  },
  {
    label: "Stream Processing",
    value: "Flink SQL",
    detailLabel: "Calculates",
    detail: "prep_ratio, rescue_score, health_status",
    description: "Processes restaurant events in real time to identify operational stress.",
  },
  {
    label: "Rescue Alerts",
    value: "restaurant_rescue_alerts",
    detailLabel: "Contains",
    detail: "Restaurants requiring operational attention",
    description: "The output topic consumed by the Order Rescue application.",
  },
  {
    label: "Application",
    value: "Order Rescue",
    detailLabel: "Runtime",
    detail: "Next.js application running on Vercel",
    description: "Presents the latest restaurant rescue signals for operations teams.",
  },
] as const;

function formatUpdatedAt(updatedAt: Date | null): string {
  if (!updatedAt) {
    return "Connecting to live data";
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - updatedAt.getTime()) / 1_000),
  );

  return elapsedSeconds === 0
    ? "Updated just now"
    : `Updated ${elapsedSeconds} second${elapsedSeconds === 1 ? "" : "s"} ago`;
}

function StatusBadge({ status }: { status: HealthStatus }) {
  const statusClass = status === "HIGH" ? "critical" : status.toLowerCase();

  return <span className={`status-badge status-${statusClass}`}>{status}</span>;
}

function Score({ score }: { score: number }) {
  return (
    <div className={`score score-${score >= 70 ? "high" : score >= 40 ? "medium" : "low"}`}>
      <strong>{score}</strong>
      <span>Rescue Score</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  status,
}: {
  label: string;
  value: number;
  status?: HealthStatus;
}) {
  return (
    <article className={`metric-card${status ? ` metric-${status.toLowerCase()}` : ""}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

export default function Home() {
  const [alerts, setAlerts] = useState<RestaurantRescueAlert[]>([]);
  const [dashboardState, setDashboardState] = useState<DashboardState>("loading");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [selectedPipelineStage, setSelectedPipelineStage] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    async function loadAlerts() {
      try {
        const response = await fetch("/api/alerts", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Alerts request failed");
        }

        const payload: RestaurantRescueAlertsResponse = await response.json();

        if (!active) {
          return;
        }

        const sortedAlerts = [...payload.alerts].sort(
          (first, second) =>
            statusOrder[first.health_status] - statusOrder[second.health_status] ||
            second.rescue_score - first.rescue_score,
        );
        setAlerts(sortedAlerts);
        setUpdatedAt(new Date());
        setDashboardState("ready");
        setSelectedRestaurantId((currentSelection) =>
          currentSelection && sortedAlerts.some(({ restaurant_id }) => restaurant_id === currentSelection)
            ? currentSelection
            : (sortedAlerts[0]?.restaurant_id ?? null),
        );
      } catch {
        if (active) {
          setDashboardState("error");
        }
      }
    }

    void loadAlerts();
    const poller = window.setInterval(() => void loadAlerts(), POLLING_INTERVAL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => {
      active = false;
      window.clearInterval(poller);
      window.clearInterval(clock);
    };
  }, []);

  const selectedAlert = alerts.find(
    ({ restaurant_id }) => restaurant_id === selectedRestaurantId,
  );
  const statusCounts = alerts.reduce(
    (counts, { health_status }) => {
      if (health_status === "CRITICAL" || health_status === "WARNING" || health_status === "HEALTHY") {
        counts[health_status] += 1;
      }
      return counts;
    },
    { CRITICAL: 0, WARNING: 0, HEALTHY: 0 },
  );
  const activePipelineStage = pipelineStages[selectedPipelineStage];

  return (
    <main className="dashboard-shell">
      <section className="dashboard" aria-label="Order Rescue dashboard">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Operations command centre</p>
            <h1>Order Rescue</h1>
            <p className="subtitle">Real-time restaurant operations monitoring</p>
          </div>
          <div className={`live-state${dashboardState === "error" ? " live-error" : ""}`} aria-live="polite">
            <span className="live-dot" aria-hidden="true" />
            <div>
              <strong>{dashboardState === "error" ? "Connection problem" : "Live"}</strong>
              <span>{dashboardState === "error" ? "Retrying..." : formatUpdatedAt(updatedAt)}</span>
            </div>
          </div>
        </header>

        <section className="metrics" aria-label="Restaurant status summary">
          <MetricCard label="Restaurants monitored" value={alerts.length} />
          <MetricCard label="Critical" value={statusCounts.CRITICAL} status="CRITICAL" />
          <MetricCard label="Warning" value={statusCounts.WARNING} status="WARNING" />
          <MetricCard label="Healthy" value={statusCounts.HEALTHY} status="HEALTHY" />
        </section>

        {dashboardState === "loading" ? (
          <section className="state-panel" aria-live="polite">
            <span className="loading-ring" aria-hidden="true" />
            <div>
              <h2>Loading restaurant data...</h2>
              <p>Connecting to the live operations stream.</p>
            </div>
          </section>
        ) : alerts.length === 0 && dashboardState !== "error" ? (
          <section className="state-panel" aria-live="polite">
            <div>
              <h2>No restaurant alerts available</h2>
              <p>Waiting for streaming data...</p>
            </div>
          </section>
        ) : (
          <section className="operations-grid">
            <article className="table-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Streaming signal</p>
                  <h2>Restaurant Operations</h2>
                </div>
                <span>{alerts.length} active</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Restaurant</th>
                      <th scope="col">Prep Time</th>
                      <th scope="col">Baseline</th>
                      <th scope="col">Ratio</th>
                      <th scope="col">Active Orders</th>
                      <th scope="col">Couriers Waiting</th>
                      <th scope="col">Rescue Score</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert) => (
                      <tr
                        className={selectedAlert?.restaurant_id === alert.restaurant_id ? "selected-row" : ""}
                        key={alert.restaurant_id}
                      >
                        <td>
                          <button
                            className="restaurant-button"
                            onClick={() => setSelectedRestaurantId(alert.restaurant_id)}
                            type="button"
                          >
                            <strong>{alert.restaurant_name}</strong>
                            <span>{alert.restaurant_id}</span>
                          </button>
                        </td>
                        <td>{alert.prep_time_min} min</td>
                        <td>{alert.baseline_prep_time_min} min</td>
                        <td className="ratio-cell">{alert.prep_ratio.toFixed(2)}x</td>
                        <td>{alert.active_orders}</td>
                        <td>{alert.couriers_waiting}</td>
                        <td><Score score={alert.rescue_score} /></td>
                        <td><StatusBadge status={alert.health_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <aside className="detail-panel" aria-live="polite">
              {selectedAlert ? (
                <>
                  <div className="detail-header">
                    <div>
                      <p className="eyebrow">Restaurant detail</p>
                      <h2>{selectedAlert.restaurant_name}</h2>
                      <p>{selectedAlert.restaurant_id}</p>
                    </div>
                    <StatusBadge status={selectedAlert.health_status} />
                  </div>
                  <Score score={selectedAlert.rescue_score} />
                  <p className="insight">
                    Preparation time is {selectedAlert.prep_ratio.toFixed(2)}x the restaurant baseline.
                  </p>
                  <dl className="detail-list">
                    <div><dt>Prep time</dt><dd>{selectedAlert.prep_time_min} min</dd></div>
                    <div><dt>Baseline prep time</dt><dd>{selectedAlert.baseline_prep_time_min} min</dd></div>
                    <div><dt>Prep ratio</dt><dd>{selectedAlert.prep_ratio.toFixed(2)}x</dd></div>
                    <div><dt>Active orders</dt><dd>{selectedAlert.active_orders}</dd></div>
                    <div><dt>Couriers waiting</dt><dd>{selectedAlert.couriers_waiting}</dd></div>
                  </dl>
                </>
              ) : (
                <div className="detail-placeholder">Select a restaurant to inspect its rescue signal.</div>
              )}
            </aside>
          </section>
        )}
        {dashboardState === "error" && alerts.length === 0 ? (
          <section className="state-panel error-panel" role="alert">
            <div>
              <h2>Restaurant data is temporarily unavailable</h2>
              <p>We will keep trying to reconnect to the operations stream.</p>
            </div>
          </section>
        ) : null}

        <section className="pipeline-panel" aria-labelledby="pipeline-title">
          <div className="pipeline-heading">
            <div>
              <p className="eyebrow">Data flow</p>
              <h2 id="pipeline-title">Streaming Pipeline</h2>
              <p>Real-time restaurant events processed by Confluent Cloud</p>
            </div>
            <div className="confluent-mark" aria-label="Confluent Cloud technologies">
              <strong>Confluent Cloud</strong>
              <span>Kafka <b aria-hidden="true">/</b> Flink <b aria-hidden="true">/</b> Schema Registry</span>
            </div>
          </div>

          <div className="pipeline-flow" aria-label="Restaurant event streaming data flow">
            {pipelineStages.map((stage, index) => (
              <div className="pipeline-step" key={stage.label}>
                <button
                  aria-pressed={selectedPipelineStage === index}
                  className={`pipeline-stage${selectedPipelineStage === index ? " pipeline-stage-active" : ""}`}
                  onClick={() => setSelectedPipelineStage(index)}
                  type="button"
                >
                  <span>{stage.label}</span>
                  <strong>{stage.value}</strong>
                </button>
                {index < pipelineStages.length - 1 ? <span className="pipeline-connector" aria-hidden="true" /> : null}
              </div>
            ))}
          </div>

          <div className="pipeline-detail" aria-live="polite">
            <div>
              <p>{activePipelineStage.label}</p>
              <strong>{activePipelineStage.value}</strong>
            </div>
            <dl>
              <div><dt>{activePipelineStage.detailLabel}</dt><dd>{activePipelineStage.detail}</dd></div>
              <div><dt>How it works</dt><dd>{activePipelineStage.description}</dd></div>
            </dl>
          </div>
          <p className="pipeline-explanation">
            Restaurant status events are processed in real time by Flink to identify operational stress and generate rescue alerts.
          </p>
        </section>

        <footer className="product-footer">
          <span>Powered by</span>
          Confluent Cloud <b aria-hidden="true">/</b> Kafka <b aria-hidden="true">/</b> Flink <b aria-hidden="true">/</b> Schema Registry <b aria-hidden="true">/</b> Next.js <b aria-hidden="true">/</b> Vercel
        </footer>
      </section>
      <span className="sr-only">Current client time {now}</span>
    </main>
  );
}
