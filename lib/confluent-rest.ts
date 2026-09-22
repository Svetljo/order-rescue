import "server-only";

type ConfluentTopic = {
  cluster_id?: string;
  topic_name?: string;
};

export class ConfluentRestError extends Error {}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new ConfluentRestError(`Missing required environment variable: ${name}`);
  }

  return value;
}

function configuration() {
  return {
    restUrl: requiredEnvironmentVariable("CONFLUENT_REST_URL").replace(/\/$/, ""),
    clusterId: requiredEnvironmentVariable("CONFLUENT_CLUSTER_ID"),
    apiKey: requiredEnvironmentVariable("CONFLUENT_API_KEY"),
    apiSecret: requiredEnvironmentVariable("CONFLUENT_API_SECRET"),
    topic: requiredEnvironmentVariable("CONFLUENT_TOPIC"),
  };
}

function authenticationHeader(apiKey: string, apiSecret: string): string {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}

async function request<T>(
  pathOrUrl: string,
  init: RequestInit = {},
  mediaType = "application/json",
): Promise<T> {
  const { restUrl, apiKey, apiSecret } = configuration();
  const url = pathOrUrl.startsWith("https://")
    ? pathOrUrl
    : `${restUrl}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: mediaType,
      Authorization: authenticationHeader(apiKey, apiSecret),
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ConfluentRestError(
      `Confluent REST request failed with HTTP ${response.status}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function confluentTopicDetails() {
  const { clusterId, topic } = configuration();

  return { clusterId, topic };
}

export async function getRescueAlertsTopic(): Promise<ConfluentTopic> {
  const { clusterId, topic } = configuration();

  return request<ConfluentTopic>(
    `/kafka/v3/clusters/${encodeURIComponent(clusterId)}/topics/${encodeURIComponent(topic)}`,
  );
}
