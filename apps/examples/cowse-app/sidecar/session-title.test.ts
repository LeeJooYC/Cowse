import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	cleanGeneratedTitle,
	generateSessionTitle,
	withTitleWrite,
} from "./session-title";
import type { LiveSession, SidecarContext } from "./types";

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
	update: vi.fn(),
	factory: vi.fn(),
	config: vi.fn(),
	stream: vi.fn(),
	oauth: vi.fn(),
}));
vi.mock("@cline/core", () => ({
	CORE_BUILD_VERSION: "test",
	SessionSource: { DESKTOP: "desktop", CORE: "core" },
	RuntimeOAuthTokenManager: class {
		resolveProviderApiKey = mocks.oauth;
	},
	SqliteSessionStore: class {
		get = mocks.get;
	},
	resolveSessionBackend: async () => ({ updateSession: mocks.update }),
}));
vi.mock("@cline/llms", () => ({
	createHandlerAsync: mocks.factory,
	resolveProviderRequestHeaders: () => ({}),
}));
vi.mock("./local-model-settings", () => ({
	modelSettingsProviderConfig: mocks.config,
}));

function fixture() {
	const session = {
		config: { provider: "openai-compatible", model: "test" },
		autoTitleEligible: true,
		autoTitlePrompt: "给项目添加本地代理功能",
	} as unknown as LiveSession;
	const send = vi.fn();
	const ctx = {
		liveSessions: new Map([["s1", session]]),
		wsClients: new Set([{ send }]),
		logger: { debug: vi.fn() },
	} as unknown as SidecarContext;
	return { ctx, session, send };
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.oauth.mockResolvedValue(null);
	mocks.get.mockReturnValue({ metadata: { title: "给项目添加本地代理功能" } });
	mocks.config.mockReturnValue({
		providerId: "openai-compatible",
		modelId: "test",
		apiKey: "saved",
		baseUrl: "http://localhost:8080/v1",
	});
	mocks.update.mockResolvedValue({ updated: true });
	mocks.factory.mockResolvedValue({ createMessage: mocks.stream });
	mocks.stream.mockImplementation(async function* () {
		yield { type: "reasoning", reasoning: "not a title" };
		yield { type: "text", text: "添加本地" };
		yield { type: "text", text: "代理支持" };
		yield { type: "done", success: true };
	});
});

describe("automatic session title", () => {
	it("uses Core's canonical ClinePass OAuth credentials instead of a stale provider copy", async () => {
		const { ctx } = fixture();
		mocks.config.mockReturnValue({
			providerId: "cline-pass",
			modelId: "deepseek/deepseek-v4-flash",
			apiKey: "stale-copy",
		});
		mocks.oauth.mockResolvedValue({
			apiKey: "fresh-core-credential",
			refreshed: false,
		});
		await generateSessionTitle(ctx, "s1", "我是 AI 助手。");
		expect(mocks.oauth).toHaveBeenCalledWith({ providerId: "cline-pass" });
		expect(mocks.factory).toHaveBeenCalledWith(
			expect.objectContaining({
				providerId: "cline-pass",
				modelId: "deepseek/deepseek-v4-flash",
				apiKey: "fresh-core-credential",
			}),
		);
		expect(mocks.update).toHaveBeenCalledOnce();
	});
	it("makes one bounded tool-free request, persists only title and broadcasts it", async () => {
		const { ctx, session, send } = fixture();
		session.autoTitlePrompt = "提问".repeat(2000);
		await generateSessionTitle(ctx, "s1", "回答".repeat(2000));
		const [, messages, tools] = mocks.stream.mock.calls[0];
		expect(JSON.parse(messages[0].content).question).toHaveLength(1800);
		expect(JSON.parse(messages[0].content).answer).toHaveLength(1200);
		expect(messages).toHaveLength(1);
		expect(tools).toEqual([]);
		expect(mocks.factory.mock.calls[0][0]).toMatchObject({
			providerId: "openai-compatible",
			modelId: "test",
			maxOutputTokens: 512,
			thinking: false,
			apiKey: "saved",
		});
		expect(mocks.update).toHaveBeenCalledWith({
			sessionId: "s1",
			title: "添加本地代理支持",
		});
		expect(JSON.parse(send.mock.calls[0][0]).event).toEqual({
			name: "session_title_updated",
			payload: { sessionId: "s1", title: "添加本地代理支持" },
		});
		expect(session.title).toBe("添加本地代理支持");
		await generateSessionTitle(ctx, "s1");
		expect(mocks.factory).toHaveBeenCalledOnce();
	});
	it("does not name existing sessions or manually named sessions", async () => {
		const { ctx, session } = fixture();
		session.autoTitleEligible = undefined;
		await generateSessionTitle(ctx, "s1");
		session.autoTitleEligible = true;
		session.title = "手动标题";
		await generateSessionTitle(ctx, "s1");
		expect(mocks.factory).not.toHaveBeenCalled();
	});
	it("does not overwrite a manual rename made while the request is pending", async () => {
		const { ctx, session } = fixture();
		mocks.stream.mockImplementation(async function* () {
			session.autoTitleCancelled = true;
			yield { type: "text", text: "自动标题" };
		});
		await generateSessionTitle(ctx, "s1");
		expect(mocks.update).not.toHaveBeenCalled();
	});
	it("protects titles changed by another client", async () => {
		const { ctx } = fixture();
		mocks.get
			.mockReturnValueOnce({ metadata: { title: "原始问题" } })
			.mockReturnValue({ metadata: { title: "其他客户端改名" } });
		await generateSessionTitle(ctx, "s1");
		expect(mocks.update).not.toHaveBeenCalled();
	});
	it("does not recreate deleted sessions", async () => {
		const { ctx } = fixture();
		mocks.get.mockReturnValueOnce({ metadata: {} }).mockReturnValue(undefined);
		await generateSessionTitle(ctx, "s1");
		expect(mocks.update).not.toHaveBeenCalled();
	});
	it("deduplicates concurrent completion notifications", async () => {
		const { ctx } = fixture();
		await Promise.all([
			generateSessionTitle(ctx, "s1"),
			generateSessionTitle(ctx, "s1"),
		]);
		expect(mocks.factory).toHaveBeenCalledOnce();
	});
	it("preserves the fallback title on provider errors without logging secrets", async () => {
		const { ctx } = fixture();
		mocks.factory.mockRejectedValue(new Error("secret-token"));
		await expect(generateSessionTitle(ctx, "s1")).resolves.toBeUndefined();
		expect(mocks.update).not.toHaveBeenCalled();
		expect(
			JSON.stringify(vi.mocked(ctx.logger!.debug).mock.calls),
		).not.toContain("secret-token");
	});
	it("rejects incomplete responses", async () => {
		const { ctx } = fixture();
		mocks.stream.mockImplementation(async function* () {
			yield { type: "text", text: "部分标题" };
			yield {
				type: "done",
				success: true,
				incompleteReason: "max_output_tokens",
			};
		});
		await generateSessionTitle(ctx, "s1");
		expect(mocks.update).not.toHaveBeenCalled();
	});
	it("serializes automatic and manual title persistence", async () => {
		const order: string[] = [];
		await Promise.all([
			withTitleWrite("s", async () => {
				await Promise.resolve();
				order.push("auto");
			}),
			withTitleWrite("s", async () => {
				order.push("manual");
			}),
		]);
		expect(order).toEqual(["auto", "manual"]);
	});
	it.each([
		"",
		"解释\n标题",
		"<think>thinking</think>",
		"```标题```",
		"长".repeat(41),
	])("rejects invalid title: %s", (text) => {
		expect(cleanGeneratedTitle(text)).toBeUndefined();
	});
	it("cleans title wrappers", () => {
		expect(cleanGeneratedTitle("标题：“添加本地代理”")).toBe("添加本地代理");
	});
});
