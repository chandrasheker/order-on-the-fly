import { parseMenuImportDraft } from "@/lib/menu-import/draft";
import type { MenuImportRuntimeConfig } from "@/lib/menu-import/config";
import type { MenuImportDraft, MenuImportExtractInput, MenuImportExtractor } from "@/lib/menu-import/types";
import { MenuImportValidationError } from "@/lib/menu-import/errors";

const SYSTEM_PROMPT = `You extract restaurant menu data that is visibly present in the supplied pages.

Extract only information that is clearly present.
Do not invent dishes.
Do not invent prices.
Do not infer descriptions when absent.
Do not infer recipes, allergens, GST, prep times, or kitchen stations.
Do not invent category names unless grouping is reasonably clear from headings or layout.
When uncertain, return null rather than guessing.
If a price is ambiguous (for example 249 / 349 without a single clear price), set priceAmbiguous true and pricePaise null.

Return JSON only, matching:
{
  "categories": [
    {
      "name": "string",
      "items": [
        {
          "name": "string",
          "description": "string or null",
          "pricePaise": "integer paise or null",
          "priceText": "original price text or null",
          "priceAmbiguous": false,
          "isVeg": true | false | null,
          "confidence": { "name": 0-1, "price": 0-1 },
          "sourcePage": 1
        }
      ]
    }
  ]
}

Normalize prices to integer paise (₹249 -> 24900). Never use floating-point guesses.`;

type ChatContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export class OpenAiMenuImportExtractor implements MenuImportExtractor {
  constructor(private readonly config: MenuImportRuntimeConfig) {}

  async extractMenu(input: MenuImportExtractInput): Promise<MenuImportDraft> {
    const apiKey = this.config.apiKey;
    if (!apiKey) {
      throw new MenuImportValidationError("EXTRACTION_NOT_CONFIGURED");
    }

    const userContent: ChatContent[] = [
      {
        type: "text",
        text: `Extract the menu from ${input.pages.length} page(s) in source order. Page numbers are 1-based.`,
      },
    ];

    for (const page of input.pages) {
      if (page.kind === "text" && page.text) {
        userContent.push({
          type: "text",
          text: `Page ${page.pageNumber} (native text):\n${page.text.slice(0, 8000)}`,
        });
      } else if (page.image) {
        const b64 = page.image.bytes.toString("base64");
        userContent.push({ type: "text", text: `Page ${page.pageNumber} (image):` });
        userContent.push({
          type: "image_url",
          image_url: { url: `data:${page.image.contentType};base64,${b64}` },
        });
      }
    }

    const baseUrl = (this.config.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model || "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new MenuImportValidationError("PROVIDER_TIMEOUT");
      }
      throw new MenuImportValidationError("PROVIDER_FAILED");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new MenuImportValidationError("PROVIDER_FAILED");
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new MenuImportValidationError("PROVIDER_INVALID_OUTPUT");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new MenuImportValidationError("PROVIDER_INVALID_OUTPUT");
    }

    try {
      return parseMenuImportDraft(parsed);
    } catch {
      throw new MenuImportValidationError("PROVIDER_INVALID_OUTPUT");
    }
  }
}
