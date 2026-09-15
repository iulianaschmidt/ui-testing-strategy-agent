import { createHash } from "node:crypto";
import path from "node:path";

import { OfficeParser, type SupportedFileType } from "officeparser";

import type { RuntimeConfig } from "../config/runtime.js";
import type { SourceEvidence } from "../domain/models.js";
import type { SourceDocument, SourceReader } from "../graph/source-adapter.js";

const OFFICE_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx", ".pdf"]);
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".cs",
  ".go",
  ".rs",
  ".sql",
  ".feature",
]);

export interface EvidenceExtractor {
  extract(document: SourceDocument, content: Buffer): Promise<SourceEvidence>;
}

export class BoundedEvidenceExtractor implements EvidenceExtractor {
  constructor(private readonly maxFileBytes: number) {}

  async extract(document: SourceDocument, content: Buffer): Promise<SourceEvidence> {
    if (document.size > this.maxFileBytes || content.byteLength > this.maxFileBytes) {
      return {
        ...document,
        status: "oversized",
        failure: `File exceeds the configured ${this.maxFileBytes} byte limit`,
      };
    }

    const extension = path.extname(document.name).toLowerCase();
    if (!OFFICE_EXTENSIONS.has(extension) && !TEXT_EXTENSIONS.has(extension)) {
      return {
        ...document,
        status: "unsupported",
        failure: `Unsupported file extension: ${extension || "(none)"}`,
      };
    }

    try {
      const text = OFFICE_EXTENSIONS.has(extension)
        ? await extractOfficeText(content, extension.slice(1) as SupportedFileType)
        : content.toString("utf8");
      return {
        ...document,
        status: "available",
        text: normalizeExtractedText(text),
        contentHash: createHash("sha256").update(content).digest("hex"),
      };
    } catch (error) {
      return {
        ...document,
        status: "failed",
        failure: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

async function extractOfficeText(content: Buffer, fileType: SupportedFileType): Promise<string> {
  const ast = await OfficeParser.parseOffice(content, { fileType });
  const generated = await ast.to("text");
  return generated.value;
}

function normalizeExtractedText(text: string): string {
  return text.replace(/\r\n?/gu, "\n").split("\0").join("").trim();
}

export async function collectEvidence(
  source: SourceReader,
  config: Pick<RuntimeConfig, "maxFileBytes">,
): Promise<SourceEvidence[]> {
  const extractor = new BoundedEvidenceExtractor(config.maxFileBytes);
  const documents = await source.listDocuments();
  const results: SourceEvidence[] = [];

  for (const document of documents) {
    if (document.size > config.maxFileBytes) {
      results.push(await extractor.extract(document, Buffer.alloc(0)));
      continue;
    }
    try {
      const content = await source.download(document);
      results.push(await extractor.extract(document, content));
    } catch (error) {
      results.push({
        ...document,
        status: "failed",
        failure: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
