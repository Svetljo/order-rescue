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
  WARNING: 1,
  HEALTHY: 2,
};

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
  return <span className={`status-badge status-${status.toLowerCase()}`}>{status}</span>;
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
  const statusCounts = alerts.reduce<Record<HealthStatus, number>>(
    (counts, { health_status }) => ({
      ...counts,
      [health_status]: counts[health_status] + 1,
    }),
    { CRITICAL: 0, WARNING: 0, HEALTHY: 0 },
  );

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
      </section>
      <span className="sr-only">Current client time {now}</span>
    </main>
  );
}
