export async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as unknown;
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      for (const field of ["error", "message"]) {
        const value = record[field];
        if (typeof value === "string" && value.trim()) return value;
      }
    }
  } catch {
    // Fall back to the status when the body is not JSON.
  }

  return `La API respondió ${response.status}`;
}
