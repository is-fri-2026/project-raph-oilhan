import createClient from "openapi-fetch";
import type { paths, components } from "./api-schema";
import { accessToken } from "./auth";

export type Alternative = components["schemas"]["SoftwareAlternative"];
export type AlternativePage = components["schemas"]["SoftwareAlternativePage"];
export type User = components["schemas"]["User"];
export type UserPage = components["schemas"]["UserPage"];
export type AlternativeStatus = components["schemas"]["AlternativeStatus"];
export type UserRole = components["schemas"]["UserRole"];

const client = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL || "",
});

client.use({
  async onRequest({ request }) {
    const token = await accessToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
});

async function unwrap<T>(
  result: { data?: T; error?: unknown; response: Response },
): Promise<T> {
  if (!result.response.ok) {
    const problem = result.error as
      | { title?: string; detail?: string; errors?: Record<string, string[]> }
      | undefined;
    const fieldErrors = Object.entries(problem?.errors ?? {})
      .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
      .join(" ");
    throw new Error(
      [problem?.title, problem?.detail, fieldErrors].filter(Boolean).join(" — ")
        || `Erreur HTTP ${result.response.status}`,
    );
  }
  if (result.data === undefined) {
    throw new Error("The API response did not contain the expected data.");
  }
  return result.data;
}

export async function listAlternatives(options: {
  page: number;
  status: AlternativeStatus;
  taskId?: number;
  mine?: boolean;
}) {
  const result = await client.GET("/api/software-alternatives", {
    params: {
      query: {
        page: options.page,
        pageSize: 20,
        status: options.status,
        ...(options.mine ? { mine: true } : {}),
        ...(options.taskId === undefined ? {} : { taskId: options.taskId }),
      },
    },
  });
  return unwrap<AlternativePage>(result);
}

export async function createAlternative(input: {
  taskId: number;
  name: string;
  description: string;
}) {
  const result = await client.POST("/api/software-alternatives", { body: input });
  return unwrap<Alternative>(result);
}

export async function updateAlternative(
  id: number,
  input: Partial<{
    taskId: number;
    name: string;
    description: string;
    status: AlternativeStatus;
    moderationReason: string | null;
  }>,
) {
  const result = await client.PATCH("/api/software-alternatives/{id}", {
    params: { path: { id } },
    body: input,
  });
  return unwrap<Alternative>(result);
}

export async function deleteAlternative(id: number) {
  const result = await client.DELETE("/api/software-alternatives/{id}", {
    params: { path: { id } },
  });
  if (!result.response.ok) {
    throw new Error(`Could not delete the submission (HTTP ${result.response.status}).`);
  }
}

export async function listUsers(page: number) {
  const result = await client.GET("/api/users", {
    params: { query: { page, pageSize: 20 } },
  });
  return unwrap<UserPage>(result);
}

export async function updateUserRole(id: number, role: UserRole) {
  const result = await client.PATCH("/api/users/{id}", {
    params: { path: { id } },
    body: { role },
  });
  return unwrap<User>(result);
}
