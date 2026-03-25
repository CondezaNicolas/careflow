import { useMutation } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3311";

interface CreateUserRequest {
  email: string;
  password: string;
  role: string;
  tenantId: string;
}

interface CreateUserResponse {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  createdAt: string;
}

export function useCreateUser() {
  return useMutation<CreateUserResponse, Error, CreateUserRequest>({
    mutationFn: async (data) => {
      const response = await fetch(`${API_URL}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create user");
      }
      return response.json();
    }
  });
}
