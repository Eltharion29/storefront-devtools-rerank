import test from "node:test";
import assert from "node:assert/strict";
import { rerankStorefrontSearch } from "./rerank_search.ts";

test("the request boundary keeps a checkout-oriented search result set typed", async () => {
  await assert.rejects(rerankStorefrontSearch({ query: "checkout webhook", products: [] }), /at least 1/);
});
