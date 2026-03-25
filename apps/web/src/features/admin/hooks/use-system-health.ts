import { useEffect, useState } from "react";

interface HealthStatus {
  api: "healthy" | "unhealthy" | "loading" | "error";
  db: "healthy" | "unhealthy" | "loading" | "error";
}

export function useSystemHealth() {
  const [status, setStatus] = useState<HealthStatus>({
    api: "loading",
    db: "loading"
  });

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3311";

    async function checkHealth() {
      try {
        const [liveResponse, readyResponse] = await Promise.all([
          fetch(`${API_URL}/health/live`),
          fetch(`${API_URL}/health/ready`)
        ]);

        const isApiHealthy = liveResponse.ok && readyResponse.ok;

        setStatus((prev) => ({
          ...prev,
          api: isApiHealthy ? "healthy" : "unhealthy",
          db: isApiHealthy ? "healthy" : "unhealthy"
        }));
      } catch (error) {
        console.error("Health check failed:", error);
        setStatus((prev) => ({
          ...prev,
          api: "error",
          db: "error"
        }));
      }
    }

    checkHealth();

    const interval = setInterval(checkHealth, 10000);

    return () => clearInterval(interval);
  }, []);

  return status;
}
