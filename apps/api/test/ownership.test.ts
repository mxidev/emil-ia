import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { DATABASE_QUERIES } from "../src/database/queries.js";
import { ConversationRepository } from "../src/repositories/conversation.repository.js";

describe("business data ownership", () => {
  it("passes the authenticated owner to conversation reads and writes", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const repository = new ConversationRepository({ query } as unknown as Pool);

    await repository.createConversation("student-a", "conversation-a", "Algebra");
    await repository.getMessages("student-a", "conversation-a");
    await repository.listConversations("student-a");
    await repository.findConversationTitle("student-a", "conversation-a");
    await repository.addFeedback("student-a", "conversation-a", "positive");

    expect(query).toHaveBeenNthCalledWith(
      1,
      DATABASE_QUERIES.createConversation,
      ["conversation-a", "student-a", "Algebra"],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      DATABASE_QUERIES.getMessages,
      ["conversation-a", "student-a"],
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      DATABASE_QUERIES.listConversations,
      ["student-a"],
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      DATABASE_QUERIES.findConversationTitle,
      ["conversation-a", "student-a"],
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      DATABASE_QUERIES.addFeedback,
      expect.arrayContaining(["conversation-a", "positive"]),
    );
  });

  it("keeps every attachment query owner-scoped", () => {
    expect(DATABASE_QUERIES.listAttachments).toMatch(/user_id/);
    expect(DATABASE_QUERIES.deleteAttachment).toMatch(/user_id/);
    expect(DATABASE_QUERIES.getAttachmentsForChat).toMatch(/user_id/);
  });
});
