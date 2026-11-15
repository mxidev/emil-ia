import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);

function read(relativePath) {
  return readFileSync(new URL(relativePath, root), "utf8");
}

test("provides a skip link and stable keyboard focus target", () => {
  const appTemplate = read("src/app/app.component.html");

  assert.match(
    appTemplate,
    /<a\s+[^>]*class="skip-link"[^>]*href="#chat-content"[^>]*>\s*Saltar al contenido\s*<\/a>/s,
  );
  assert.match(
    appTemplate,
    /<app-chat\s+[^>]*id="chat-content"[^>]*tabindex="-1"/s,
  );
});

test("exposes the chat landmark and busy state to assistive technology", () => {
  const chatTemplate = read("src/app/components/chat/chat.component.html");

  assert.match(chatTemplate, /<h2\s+[^>]*id="chat-heading"[^>]*>/s);
  assert.match(
    chatTemplate,
    /<section\s+[^>]*aria-labelledby="chat-heading"[^>]*>/s,
  );
  assert.match(chatTemplate, /\[attr\.aria-busy\]="state\.loading\(\)"/);
  assert.equal(
    (chatTemplate.match(/aria-live="polite"/g) ?? []).length,
    1,
  );
  assert.match(chatTemplate, /aria-live="polite"[^>]*aria-atomic="true"/s);
});

test("keeps collapsed history inert", () => {
  const appTemplate = read("src/app/app.component.html");

  assert.match(
    appTemplate,
    /<app-conversation-history\s+[^>]*\[attr\.inert\]="historyExpanded\(\) \? null : ''"/s,
  );
});

test("does not disable browser zoom", () => {
  const globalStyles = read("src/styles.css");

  assert.doesNotMatch(globalStyles, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(globalStyles, /maximum-scale\s*=/i);
});
