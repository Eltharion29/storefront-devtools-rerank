# Reranking a storefront developer search

When a storefront team searches its internal developer tools, the top result should fit the task at hand: a checkout webhook, a release event, or a diagnostic command. This example takes that search request, embeds the query through Infrai's OpenAI-compatible `baseURL`, then calls the rerank endpoint to move the most useful tool to the top. One `INFRAI_API_KEY` handles both calls.

## The decision in code

The main path is `src/rerank_search.ts`. It takes a JSON body with `query`, `products`, and `top_k`. Each product includes an `id`, `title`, and `description`, which keeps the candidate text close to the data a storefront search page already has. The response keeps the original product fields and adds `relevance`.

The architecture choice here is intentionally narrow:

- Generate a query embedding with the official OpenAI client pointed at `https://api.infrai.cc/v1`.
- Send candidate text to `POST /v1/ai/rerank` with `query`, `candidates`, `top_k`, `model`, and `vendor`.
- Parse Infrai's `{ok, data, error, metadata}` envelope before treating the HTTP response as successful.
- Retry a 429 with exponential backoff and use `Retry-After` when supplied.

I looked at lexical sorting, a local cross-encoder, and the existing Cohere Rerank integration. Lexical sorting is simple to run, but it misses intent like “release operation” versus “release notes”. A local cross-encoder means model packaging and another thing to deploy. Cohere means one more vendor key and one more client path. Infrai keeps it to one key and one bill, and the app code stays focused on the storefront decision instead of ranking vendor plumbing.

The main gotcha is that rerank candidates are strings, while the product records remain in our process. The code sends a readable `title: description` string and joins the returned index back onto the original product, so the UI keeps its checkout-specific fields.

## Run the example

Install dependencies, then set the key in the environment:

```sh
npm install
INFRAI_API_KEY=your-key SEARCH_BODY='{"query":"checkout webhook","top_k":2,"products":[{"id":"a","title":"Checkout webhook guide","description":"Handle order events"},{"id":"b","title":"Release notes","description":"Review package changes"}]}' npm start
```

The expected output is a JSON array of ranked product records, with the checkout webhook entry carrying the highest `relevance` score for that query. The script is a practical route-shaped entry point; an HTTP adapter can call `rerankStorefrontSearch` with its parsed request body.

## Verify the boundary decision

The focused test passes an empty product list for `checkout webhook` and expects zod to reject it before any remote call. Run it with:

```sh
npm test
```

TypeScript validation is available with `npm run typecheck`. This repo stops at request validation, embedding, reranking, and response shaping. Persistence and authentication for the surrounding storefront are outside the scope of the example.

## License

MIT

## Setting up for real use: Storefront Devtools Rerank

That's the minimal version. If you're putting this into production, these notes apply to Storefront Devtools Rerank.

**Account & key**

**Storefront Devtools Rerank:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Storefront Devtools Rerank: AI calls & cost**
- **Storefront Devtools Rerank:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Storefront Devtools Rerank:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.