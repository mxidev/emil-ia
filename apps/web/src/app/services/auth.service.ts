import { Injectable, signal } from "@angular/core";
import { API_BASE_URL } from "../constants/api.constants";
import { ApiClientService } from "./api-client.service";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthUser {
  id: string;
  displayName: string;
  issuer?: string;
  subject?: string;
}

@Injectable({ providedIn: "root" })
export class AuthService {
  readonly status = signal<AuthStatus>("loading");
  readonly user = signal<AuthUser | null>(null);
  private readonly unauthenticatedHandlers = new Set<() => void>();

  constructor(private readonly client: ApiClientService) {
    this.client.setUnauthorizedHandler?.(() => this.setUnauthenticated());
  }

  onUnauthenticated(handler: () => void): () => void {
    this.unauthenticatedHandlers.add(handler);
    return () => this.unauthenticatedHandlers.delete(handler);
  }

  async initialize(): Promise<void> {
    try {
      const response = await this.client.request(`${API_BASE_URL}/auth/session`);
      if (!response.ok) {
        this.setUnauthenticated();
        return;
      }
      const body = (await response.json()) as { user?: AuthUser };
      if (!body.user) {
        this.setUnauthenticated();
        return;
      }
      this.user.set(body.user);
      this.status.set("authenticated");
    } catch {
      this.setUnauthenticated();
    }
  }

  login(): void {
    globalThis.location.assign(`${API_BASE_URL}/auth/login`);
  }

  async logout(): Promise<void> {
    try {
      await this.client.request(`${API_BASE_URL}/auth/logout`, { method: "POST" });
    } finally {
      this.setUnauthenticated();
    }
  }

  private setUnauthenticated(): void {
    const wasAuthenticated = this.status() === "authenticated";
    this.user.set(null);
    this.status.set("unauthenticated");
    if (wasAuthenticated) {
      for (const handler of this.unauthenticatedHandlers) handler();
    }
  }
}
