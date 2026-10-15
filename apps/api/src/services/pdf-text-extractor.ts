import { PDFParse } from "pdf-parse";

export interface PdfTextExtractor {
  extract(content: Buffer): Promise<string>;
}

export class PdfTextExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfTextExtractionError";
  }
}

export class PdfParseTextExtractor implements PdfTextExtractor {
  async extract(content: Buffer): Promise<string> {
    const parser = new PDFParse({ data: content });

    try {
      const result = await parser.getText({ pageJoiner: "" });
      return result.text.replace(/\s+/g, " ").trim();
    } catch (error) {
      throw new PdfTextExtractionError("Unable to extract PDF text", {
        cause: error,
      });
    } finally {
      await parser.destroy();
    }
  }
}
