import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3311";

interface SearchResults {
  users?: Array<{ id: string; email: string; role: string; rank: number }>;
  patients?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    rank: number;
  }>;
  appointments?: Array<{
    id: string;
    patientId: string;
    specialistId: string;
    rank: number;
  }>;
  logs?: Array<{
    id: string;
    action: string;
    entityType: string;
    rank: number;
  }>;
}

export function useAdminSearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce query changes
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  return useQuery<SearchResults>({
    queryKey: ["admin", "search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        return {};
      }
      const response = await fetch(
        `${API_URL}/admin/search?q=${encodeURIComponent(debouncedQuery)}`
      );
      if (!response.ok) {
        throw new Error("Failed to search");
      }
      return response.json();
    },
    enabled: debouncedQuery.length >= 2
  });
}
