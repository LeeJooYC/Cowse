import { expect, it } from "vitest";
import type { AgentConfig } from "@cline/shared";
import { createAgentModelFromConfig } from "./handler-factory";

it.each([4096, 8192, 16384, 32768, 0])("sends output budget %s through Core to HTTP with context metadata", async (maxOutputTokens) => {
	let body: Record<string, unknown> | undefined;
	const mockFetch = (async (_input: unknown, init: RequestInit) => {
		body = JSON.parse(String(init.body));
		return new Response('data: {"id":"test","object":"chat.completion.chunk","created":0,"model":"local","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
	}) as typeof fetch;
	const model = createAgentModelFromConfig({ providerId: "openai-compatible", modelId: "local",
		providerConfig: { providerId: "openai-compatible", baseUrl: "https://example.invalid/v1", apiKey: "test", fetch: mockFetch, maxOutputTokens,
			modelInfo: { id: "local", name: "local", contextWindow: 262144 } },
	} as AgentConfig, undefined);
	for await (const event of await model.stream({ messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], tools: [] })) {
		if (event.type === "error") throw new Error(JSON.stringify(event));
	}
	expect(body).toBeDefined();
	if (maxOutputTokens === 0) expect(body).not.toHaveProperty("max_tokens");
	else expect(body).toHaveProperty("max_tokens", maxOutputTokens);
});
