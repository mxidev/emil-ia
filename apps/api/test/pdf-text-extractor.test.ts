import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import { PdfParseTextExtractor } from "../src/services/pdf-text-extractor.js";

async function createPdf(text?: string): Promise<Buffer> {
  const document = new PDFDocument({ margin: 54 });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
  });
  if (text) document.text(text);
  document.end();
  return finished;
}

describe("PdfParseTextExtractor", () => {
  const extractor = new PdfParseTextExtractor();

  it("extracts and normalizes text from a valid PDF", async () => {
    const content = await extractor.extract(
      await createPdf("Teorema\n de   Pitágoras"),
    );

    expect(content).toContain("Teorema de Pitágoras");
  });

  it("rejects malformed PDF bytes", async () => {
    await expect(extractor.extract(Buffer.from("not a PDF"))).rejects.toThrow();
  });

  it("returns empty text for a PDF without an extractable text layer", async () => {
    await expect(extractor.extract(await createPdf())).resolves.toBe("");
  });
});
