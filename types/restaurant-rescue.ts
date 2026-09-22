export type HealthStatus = "CRITICAL" | "WARNING" | "HEALTHY";

export type RestaurantRescueAlert = {
  restaurant_id: string;
  restaurant_name: string;
  prep_time_min: number;
  baseline_prep_time_min: number;
  active_orders: number;
  couriers_waiting: number;
  prep_ratio: number;
  rescue_score: number;
  health_status: HealthStatus;
};

export type RestaurantRescueAlertsResponse = {
  alerts: RestaurantRescueAlert[];
};
