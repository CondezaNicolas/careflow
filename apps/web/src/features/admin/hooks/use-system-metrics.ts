import { useEffect, useState } from "react";

interface SystemMetrics {
  api: { status: string; uptime: number };
  db: { status: string; connections: number };
  worker: { status: string; queue: number };
  sync: { status: string; lastSync: string };
}

export function useSystemMetrics() {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    api: { status: "unknown", uptime: 0 },
    db: { status: "unknown", connections: 0 },
    worker: { status: "unknown", queue: 0 },
    sync: { status: "unknown", lastSync: "N/A" }
  });

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3311";

    async function fetchMetrics() {
      try {
        const response = await fetch(`${API_URL}/ops/metrics`);

        if (!response.ok) {
          throw new Error("Failed to fetch metrics");
        }

        const data = await response.json();
        setMetrics(data);
      } catch (error) {
        console.error("Metrics fetch failed:", error);
        setMetrics((prev) => ({
          api: { ...prev.api, status: "error" },
          db: { ...prev.db, status: "error" },
          worker: { ...prev.worker, status: "error" },
          sync: { ...prev.sync, status: "error" }
        }));
      }
    }

    fetchMetrics();

    const interval = setInterval(fetchMetrics, 30000);

    return () => clearInterval(interval);
  }, []);

  return metrics;
}
