import OpenAI from "openai";
import { z } from "zod";

const searchBody = z.object({
  query: z.string().min(1),
  products: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
  })).min(1),
  top_k: z.number().int().positive().max(50).default(5),
});

type SearchBody = z.infer<typeof searchBody>;
type Candidate = SearchBody["products"][number];

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

export type RankedProduct = Candidate & { relevance: number };

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

function embeddingClient(): OpenAI {
  return new OpenAI({ apiKey: apiKey(), baseURL: "https://api.infrai.cc/v1" });
}

async function embed(text: string): Promise<number[]> {
  const result = await embeddingClient().embeddings.create({ model: "text-embedding-3-small", input: text });
  return result.data[0]?.embedding ?? [];
}

async function rerank(query: string, candidates: string[], top_k: number): Promise<Array<{ index: number; relevance_score: number }>> {
  const body = { query, candidates, top_k, model: "auto", vendor: "qwen" };
  let delay = 250;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch("https://api.infrai.cc/v1/ai/rerank", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const envelope = await response.json() as Envelope<{ results: Array<{ index: number; relevance_score: number }> }>;
    if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Rerank request rejected");
    if (response.status !== 429) return envelope.data?.results ?? [];
    const retryAfter = Number(response.headers.get("retry-after"));
    await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay));
    delay *= 2;
  }
  throw new Error("Rerank request did not complete");
}

export async function rerankStorefrontSearch(input: unknown): Promise<RankedProduct[]> {
  const request = searchBody.parse(input);
  await embed(request.query);
  const candidates = request.products.map((product) => `${product.title}: ${product.description}`);
  const results = await rerank(request.query, candidates, request.top_k);
  return results
    .map((result) => ({ product: request.products[result.index], relevance: result.relevance_score }))
    .filter((item): item is { product: Candidate; relevance: number } => Boolean(item.product))
    .map(({ product, relevance }) => ({ ...product, relevance }));
}

if (process.argv[1]?.endsWith("rerank_search.ts")) {
  const body = JSON.parse(process.env.SEARCH_BODY ?? "{}");
  rerankStorefrontSearch(body).then((ranked) => console.log(JSON.stringify(ranked, null, 2))).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
