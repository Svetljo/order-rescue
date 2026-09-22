import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@confluentinc/kafka-javascript"],
  outputFileTracingIncludes: {
    "/api/kafka-test": [
      "./node_modules/@confluentinc/kafka-javascript/build/Release/confluent-kafka-javascript.node",
    ],
    "/api/alerts": [
      "./node_modules/@confluentinc/kafka-javascript/build/Release/confluent-kafka-javascript.node",
    ],
  },
};

export default nextConfig;
