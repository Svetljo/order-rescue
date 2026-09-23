# Order Rescue

A real-time restaurant operations monitoring application powered by Confluent Cloud, Kafka, and Flink SQL.


<img width="3024" height="2688" alt="order-rescue-zeta vercel app_" src="https://github.com/user-attachments/assets/df23728b-c061-491d-87d1-41fa2c9ac8d9" />

## The Problem

A customer places an order.

At first, everything looks fine:

- restaurant accepts the order
- food preparation starts
- courier is assigned
- courier approaches the restaurant
- pickup happens
- delivery begins

But then the situation can change.

The restaurant starts falling behind. The courier is waiting. The customer's estimated delivery time deteriorates. The longer the delay continues, the greater the risk that the customer experience will be negatively affected.

For example:

> **Restaurant is 12 minutes behind → courier is waiting → delivery ETA deteriorates → customer has already waited 32 minutes → risk of cancellation increases.**

Traditional operational systems can treat these events as individual signals. The challenge is connecting them into a continuously evolving picture of restaurant health and identifying problems early enough to act.

Order Rescue asks a simple operational question:

> **Which restaurants are becoming operationally stressed, and where should rescue attention be focused right now?**

Instead of waiting for a periodic report, Order Rescue continuously processes restaurant events and turns them into actionable rescue signals.

## The Solution

Order Rescue uses Confluent Cloud to process restaurant operational events in real time.

The application:

1. Generates restaurant status events using the Confluent Datagen Source Connector.
2. Publishes the events to the `restaurant_events_v2` Kafka topic.
3. Processes the event stream with Flink SQL.
4. Calculates operational indicators including `prep_ratio`, `rescue_score`, and `health_status`.
5. Publishes the resulting rescue alerts to the `restaurant_rescue_alerts` Kafka topic.
6. Consumes the alert stream in a Next.js application deployed on Vercel.
7. Presents the current restaurant situation in an operations dashboard.

The result is a streaming application that transforms low-level restaurant events into a higher-level operational signal that can help teams identify where rescue intervention may be needed.

## Architecture

```text
Restaurant Events
      |
      v
Confluent Datagen
      |
      v
Kafka topic
restaurant_events_v2
      |
      v
Flink SQL
      |
      +-- prep_ratio
      +-- rescue_score
      +-- health_status
      |
      v
Kafka topic
restaurant_rescue_alerts
      |
      v
Next.js application
      |
      v
Vercel
      |
      v
Order Rescue Dashboard
```

Kafka provides the event streaming backbone, while Flink SQL continuously transforms restaurant events into operational rescue alerts. The Next.js application consumes the resulting alert stream and presents it to operations users.

## Why Streaming?

This is a streaming problem rather than a CRUD or reporting application:

- Restaurant events arrive continuously.
- Operational conditions can change from one event to the next.
- Flink calculates derived signals continuously as events arrive.
- Kafka decouples event production, stream processing, and the application.
- Applications can consume rescue alerts independently of the original event producers.

Order Rescue identifies and surfaces operational conditions; it does not guarantee zero-latency intervention or automatically dispatch rescue resources.

## Rescue Logic

### Preparation ratio

`prep_ratio` represents preparation time relative to the restaurant's baseline preparation time.

```text
prep_ratio = prep_time_min / baseline_prep_time_min
```

A higher ratio indicates that the restaurant is taking substantially longer than its baseline.

### Rescue score

`rescue_score` is calculated by the existing Flink processing pipeline and represents the urgency signal consumed by the application. The frontend does not independently calculate or replace this score.

### Health status

The Flink pipeline produces the restaurant health classification consumed by the dashboard. The application handles statuses observed in the alert stream, including:

- `HEALTHY`
- `HIGH`
- `CRITICAL`

The dashboard type definitions also support `WARNING`. Thresholds and scoring rules remain in the Flink processing pipeline rather than the frontend.

## Example Alert

```json
{
  "restaurant_id": "REST-99",
  "restaurant_name": "Burger Lab",
  "prep_time_min": 33,
  "baseline_prep_time_min": 15,
  "active_orders": 17,
  "couriers_waiting": 1,
  "prep_ratio": 2.2,
  "rescue_score": 70,
  "health_status": "HIGH"
}
```

In this example, Burger Lab's preparation time is 2.2x its baseline while 17 orders are active. Flink has transformed these operational signals into a HIGH-priority rescue alert for the application.

This is a representative event shape, not hard-coded application data.

## Technology

| Technology | Role |
| --- | --- |
| Confluent Cloud | Managed streaming platform services, including Kafka, Flink, and Schema Registry |
| Apache Kafka | Event streaming backbone for input events and rescue alerts |
| Confluent Datagen Source Connector | Generates the restaurant event stream |
| Apache Flink / Flink SQL | Continuously transforms restaurant events into rescue alerts |
| Schema Registry | Manages the schema associated with Kafka data |
| Next.js | Server-rendered web application and API routes |
| React | Dashboard user interface |
| TypeScript | Application language and alert type definitions |
| Vercel | Application hosting platform |

Confluent Datagen Source Connector is used to generate the restaurant event stream. Flink and Schema Registry are Confluent Cloud services/components, not Kafka connectors.

## Kafka Topics

### Input: `restaurant_events_v2`

Contains restaurant operational status events including:

- Restaurant ID
- Restaurant name
- Preparation time
- Baseline preparation time
- Active orders
- Couriers waiting
- Event type

### Output: `restaurant_rescue_alerts`

Contains enriched rescue alerts including:

- Restaurant ID
- Restaurant name
- Preparation time
- Baseline preparation time
- Active orders
- Couriers waiting
- Preparation ratio
- Rescue score
- Health status

## Schema Registry

Schema Registry is used to manage the schema associated with the Kafka data. The application validates the alert fields it consumes in [`types/restaurant-rescue.ts`](types/restaurant-rescue.ts) and [`lib/kafka.ts`](lib/kafka.ts).

No generated Schema Registry schema file is tracked in this repository; the authoritative Kafka schema is managed in Confluent Cloud.

## Application

The [Order Rescue dashboard](https://order-rescue-zeta.vercel.app) provides:

- Number of monitored restaurants
- Critical, high, warning, and healthy operational states when present in the alert stream
- Preparation time and baseline comparison
- Preparation ratio
- Active orders
- Couriers waiting
- Rescue score
- Restaurant detail view
- Automatic refresh
- Streaming pipeline visualization

## Current Architecture / Prototype Scope

The dashboard uses short-lived server-side Kafka consumers from Vercel to retrieve a bounded snapshot of recent alert events. The application reduces received events to the latest observed state per restaurant.

This is intentional for the prototype and keeps the application simple without introducing another persistence or streaming service. It is not a persistent Kafka consumer or a production-grade always-on streaming consumer.

## Security

Kafka credentials are kept server-side in Vercel environment variables. The browser does not connect directly to Kafka.

```text
Browser
  |
  v
Next.js API
  |
  v
Kafka
  |
  v
Confluent Cloud
```

Credentials must never be exposed to the browser or committed to the repository.

## Running Locally

### Prerequisites

- Node.js `22.x` (as declared in `package.json`)
- Access to the Confluent Cloud Kafka cluster and REST endpoint used by the application

### Setup

Create a local `.env.local` file with these variable names. Do not commit this file or include real credential values.

```bash
KAFKA_BROKERS=
KAFKA_API_KEY=
KAFKA_API_SECRET=
CONFLUENT_REST_URL=
CONFLUENT_CLUSTER_ID=
CONFLUENT_API_KEY=
CONFLUENT_API_SECRET=
CONFLUENT_TOPIC=
```

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Validation

Run the project's existing checks:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Project Goal

Order Rescue demonstrates how a streaming platform can turn continuously arriving operational events into actionable application-level signals. Instead of treating restaurant performance as a periodic report, the application treats it as a live event stream that can be continuously processed, enriched, and consumed.
