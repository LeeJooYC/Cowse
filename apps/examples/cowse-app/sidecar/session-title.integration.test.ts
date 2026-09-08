import { describe, expect, it, vi } from "vitest";
import type { SidecarContext, LiveSession } from "./types";

const mocks = vi.hoisted(() => ({
	update: vi.fn(),
	config: vi.fn(),
	get: vi.fn(),
}));
vi.mock("@cline/core", () => ({
	CORE_BUILD_VERSION: "test",
	SessionSource: { DESKTOP: "desktop", CORE: "core" },
	RuntimeOAuthTokenManager: class {
		async resolveProviderApiKey() {
			return null;
		}
	},
	SqliteSessionStore: class {
		get = mocks.get;
	},
	resolveSessionBackend: async () => ({ updateSession: mocks.update }),
}));
vi.mock("./local-model-settings", () => ({
	modelSettingsProviderConfig: mocks.config,
}));

describe("automatic title with the real Cline model adapter", () => {
	it.each([
		"openai-compatible",
		"cline-pass",
	])("routes a tool-free %s completion through the configured fetch and keeps it out of chat messages", async (providerId) => {
		vi.clearAllMocks();
		const fetchMock = vi.fn(
			async () =>
				new Response(
					[
						'data: {"id":"title-1","object":"chat.completion.chunk","created":1,"model":"title-test","choices":[{"index":0,"delta":{"role":"assistant","content":"添加本地代理"},"finish_reason":null}]}\n\n',
						'data: {"id":"title-1","object":"chat.completion.chunk","created":1,"model":"title-test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
						"data: [DONE]\n\n",
					].join(""),
					{ headers: { "Content-Type": "text/event-stream" } },
				),
		);
		mocks.config.mockReturnValue({
			providerId,
			modelId: "title-test",
			apiKey: "test-only",
			baseUrl: "https://title-test.invalid/v1",
			fetch: fetchMock,
		});
		mocks.get.mockReturnValue({ metadata: { title: "请给软件增加代理功能" } });
		mocks.update.mockResolvedValue({ updated: true });
		const session = {
			config: {},
			messages: [],
			autoTitleEligible: true,
			autoTitlePrompt: "请给软件增加代理功能",
		} as unknown as LiveSession;
		const ctx = {
			liveSessions: new Map([["title-test", session]]),
			wsClients: new Set(),
			logger: { debug: vi.fn() },
		} as unknown as SidecarContext;
		const { generateSessionTitle } = await import("./session-title");
		await generateSessionTitle(
			ctx,
			"title-test",
			"可以添加自动检测和手动配置。",
		);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(String(url)).toBe("https://title-test.invalid/v1/chat/completions");
		const request = JSON.parse(String(init.body));
		expect(request.model).toBe("title-test");
		expect(request.stream).toBe(true);
		expect(request.tools ?? []).toEqual([]);
		expect(init.signal).toBeInstanceOf(AbortSignal);
		if (providerId === "cline-pass") {
			const headers = new Headers(init.headers);
			expect(headers.get("X-CLIENT-TYPE")).toBe("cline-desktop");
			expect(headers.get("X-Task-ID")).toBe("title-test");
		}
		expect(mocks.update).toHaveBeenCalledWith({
			sessionId: "title-test",
			title: "添加本地代理",
		});
		expect(session.messages).toEqual([]);
	});
});
