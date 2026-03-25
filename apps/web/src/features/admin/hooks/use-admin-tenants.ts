import { useQuery } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3311";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

export function useAdminTenants() {
  return useQuery<Tenant[]>({
    queryKey: ["admin", "tenants"],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/admin/tenants`);
      if (!response.ok) {
        throw new Error("Failed to fetch tenants");
      }
      return response.json();
    }
  });
}
