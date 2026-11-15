import { Injectable } from "@angular/core";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function csrfCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("emilia_csrf="))
    ?.slice("emilia_csrf=".length);
  return value ? decodeURIComponent(value) : undefined;
}

@Injectable({ providedIn: "root" })
export class ApiClientService {
  private unauthorizedHandler: (() => void) | undefined;

  setUnauthorizedHandler(handler: () => void): void {
    this.unauthorizedHandler = handler;
  }

  async request(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    if (UNSAFE_METHODS.has(method)) {
      const csrf = csrfCookie();
      if (csrf) headers.set("x-csrf-token", csrf);
    }
    const response = await fetch(input, {
      ...init,
      credentials: "include",
      headers,
    });
    if (response.status === 401) this.unauthorizedHandler?.();
    return response;
  }
}
