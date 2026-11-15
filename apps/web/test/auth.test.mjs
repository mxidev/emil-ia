import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "../src/app/services/auth.service.ts";

test("bootstraps an authenticated browser session", async () => {
  const user = { id: "user-1", displayName: "Ada Lovelace" };
  const client = {
    request: async () => new Response(JSON.stringify({ user }), { status: 200 }),
  };
  const auth = new AuthService(client);

  await auth.initialize();

  assert.equal(auth.status(), "authenticated");
  assert.deepEqual(auth.user(), user);
});

test("treats an absent session as unauthenticated", async () => {
  const client = {
    request: async () => new Response(JSON.stringify({ error: "Unauthenticated" }), { status: 401 }),
  };
  const auth = new AuthService(client);

  await auth.initialize();

  assert.equal(auth.status(), "unauthenticated");
  assert.equal(auth.user(), null);
});

test("navigates to API login without storing a provider token", () => {
  const originalLocation = globalThis.location;
  let destination;
  globalThis.location = { assign: (url) => { destination = url; } };
  try {
    const auth = new AuthService({ request: async () => new Response() });
    auth.login();
    assert.equal(destination, "http://localhost:3000/api/auth/login");
  } finally {
    globalThis.location = originalLocation;
  }
});

test("clears local auth state after logout", async () => {
  const calls = [];
  const client = {
    request: async (_url, init) => {
      calls.push(init);
      return new Response(null, { status: 204 });
    },
  };
  const auth = new AuthService(client);
  auth.user.set({ id: "user-1", displayName: "Ada" });
  auth.status.set("authenticated");

  await auth.logout();

  assert.equal(auth.status(), "unauthenticated");
  assert.equal(auth.user(), null);
  assert.equal(calls[0].method, "POST");
});

test("navigates through the provider logout URL after local logout", async () => {
  const originalLocation = globalThis.location;
  let destination;
  globalThis.location = { assign: (url) => { destination = url; } };
  const client = {
    request: async () => new Response(JSON.stringify({
      logoutUrl: "http://localhost:4566/cognito-idp/logout?client_id=client-123",
    }), { status: 200, headers: { "content-type": "application/json" } }),
  };

  try {
    const auth = new AuthService(client);
    await auth.logout();

    assert.equal(
      destination,
      "http://localhost:4566/cognito-idp/logout?client_id=client-123",
    );
    assert.equal(auth.status(), "unauthenticated");
  } finally {
    globalThis.location = originalLocation;
  }
});

test("clears local state without navigating when logout fails", async () => {
  const originalLocation = globalThis.location;
  let destination;
  globalThis.location = { assign: (url) => { destination = url; } };
  const client = {
    request: async () => new Response(JSON.stringify({
      logoutUrl: "https://attacker.invalid/logout",
    }), { status: 503, headers: { "content-type": "application/json" } }),
  };

  try {
    const auth = new AuthService(client);
    auth.user.set({ id: "user-1", displayName: "Ada" });
    auth.status.set("authenticated");

    await auth.logout();

    assert.equal(auth.status(), "unauthenticated");
    assert.equal(auth.user(), null);
    assert.equal(destination, undefined);
  } finally {
    globalThis.location = originalLocation;
  }
});

test("does not navigate when the successful logout response has no provider URL", async () => {
  const originalLocation = globalThis.location;
  let destination;
  globalThis.location = { assign: (url) => { destination = url; } };

  try {
    const auth = new AuthService({
      request: async () => new Response(JSON.stringify({ logoutUrl: null }), { status: 200 }),
    });

    await auth.logout();

    assert.equal(destination, undefined);
  } finally {
    globalThis.location = originalLocation;
  }
});

test("returns to unauthenticated state when a later API request expires the session", async () => {
  let unauthorizedHandler;
  const client = {
    setUnauthorizedHandler: (handler) => { unauthorizedHandler = handler; },
    request: async () => new Response(JSON.stringify({ user: { id: "user-1", displayName: "Ada" } }), { status: 200 }),
  };
  const auth = new AuthService(client);

  await auth.initialize();
  unauthorizedHandler();

  assert.equal(auth.status(), "unauthenticated");
  assert.equal(auth.user(), null);
});
