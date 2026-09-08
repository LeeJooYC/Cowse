import { afterEach, describe, expect, it, vi } from "vitest";
import { loginOpenAICodex } from "./codex";

const { close } = vi.hoisted(() => ({ close: vi.fn() }));
vi.mock("./server", () => ({
	startLocalOAuthServer: vi.fn(async () => ({
		callbackUrl: "http://localhost:1455/auth/callback",
		waitForCallback: async () => ({ code: "private-test-code" }),
		cancelWait: vi.fn(),
		close,
	})),
}));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("Codex authorization exchange diagnostics", () => {
	const login = () =>
		loginOpenAICodex({ onAuth: vi.fn(), onPrompt: async () => "" });

	it.each([
		[403, "unsupported_country_region_territory"],
		[400, "invalid_grant"],
		[401, "invalid_client"],
	])("preserves HTTP %s and %s without exposing the response body", async (status, code) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error: { code, message: "private-test-code private-test-token" },
							access_token: "private-test-token",
						}),
						{ status },
					),
			),
		);
		const error = await login().catch((e) => e);
		expect(error.message).toBe(
			`Token exchange failed: HTTP ${status} (${code})`,
		);
		expect(error.message).not.toContain("private-test");
		expect(close).toHaveBeenCalledOnce();
	});

	it("does not expose unknown error fields or HTML error pages", async () => {
		for (const body of [
			"<html>private-test-code</html>",
			JSON.stringify({ error: "private-test-token" }),
		]) {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(body, { status: 502 })),
			);
			await expect(login()).rejects.toThrow("Token exchange failed: HTTP 502");
			const error = await login().catch((e) => e);
			expect(error.message).not.toContain("private-test");
		}
	});

	it.each([
		"{}",
		"null",
		"not-json",
		JSON.stringify({ access_token: "private-test-token" }),
	])("reports a malformed successful response without exposing its contents: %s", async (body) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(body, { status: 200 })),
		);
		await expect(login()).rejects.toThrow("invalid token response");
		expect(close).toHaveBeenCalledOnce();
	});

	it("still completes a valid exchange", async () => {
		const payload = Buffer.from(
			JSON.stringify({
				"https://api.openai.com/auth": { chatgpt_account_id: "test-account" },
			}),
		).toString("base64url");
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							access_token: `header.${payload}.sig`,
							refresh_token: "test-refresh",
							expires_in: 3600,
						}),
						{ status: 200 },
					),
			),
		);
		await expect(login()).resolves.toMatchObject({
			accountId: "test-account",
			refresh: "test-refresh",
		});
		expect(close).toHaveBeenCalledOnce();
	});
});
