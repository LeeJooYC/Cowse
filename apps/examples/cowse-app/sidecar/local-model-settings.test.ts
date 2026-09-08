import { afterEach, describe, expect, it, vi } from "vitest";
import {
	modelSettingsProviderConfig,
	queryCompatibleContextLimit,
} from "./local-model-settings";
import {
	buildCoreSessionConfig,
	buildSessionConnectionUpdate,
} from "./chat-session";
import { reasoningChoices } from "../webview/lib/model-runtime-settings";

afterEach(() => vi.unstubAllGlobals());
const settings = {
	provider: "openai-compatible",
	model: "local-test",
	contextWindow: 32768,
	modelContextLimit: 262144,
	reasoningOptions: [
		{ type: "effort", values: ["none", "low", "medium", "xhigh"] },
	],
};

describe("local model settings", () => {
	it("queries context metadata for the exact selected model, not output length", async () => {
		const fetchMock = vi.fn(async (_url: URL) =>
			Response.json({
				data: [
					{ id: "other", context_length: 999999 },
					{
						id: "local",
						max_model_len: 262144,
						max_input_tokens: 131072,
						max_tokens: 4096,
					},
				],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		expect(
			await queryCompatibleContextLimit("local", {
				providerId: "openai-compatible",
				modelId: "local",
				baseUrl: "http://localhost:8080/v1",
			}),
		).toBe(131072);
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
			"http://localhost:8080/v1/models",
		);
		expect(
			await queryCompatibleContextLimit("missing", {
				providerId: "openai-compatible",
				modelId: "missing",
				baseUrl: "http://localhost:8080/v1",
			}),
		).toBeUndefined();
	});
	it("does not use generation max_tokens as the context limit", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({ data: [{ id: "local", max_tokens: 4096 }] }),
			),
		);
		expect(
			await queryCompatibleContextLimit("local", {
				providerId: "openai-compatible",
				modelId: "local",
				baseUrl: "http://localhost:8080/v1",
			}),
		).toBeUndefined();
	});
	it("keeps unknown controls conservative and preserves the advertised levels", () => {
		expect(reasoningChoices(undefined)).toEqual(["default"]);
		expect(
			reasoningChoices([
				{ type: "effort", values: ["none", "low", "medium", "xhigh"] },
			]),
		).toEqual(["default", "none", "low", "medium", "xhigh"]);
	});
	it("projects the budget but ignores legacy custom reasoning declarations", () => {
		const config = {
			provider: settings.provider,
			model: settings.model,
			modelSettings: settings,
		};
		const projected = modelSettingsProviderConfig(config);
		expect(projected.maxInputTokens).toBe(32768);
		expect(projected.modelInfo).toMatchObject({
			id: "local-test",
			contextWindow: 32768,
			maxInputTokens: 32768,
		});
		expect(projected.modelInfo).not.toHaveProperty("reasoningOptions");
		expect(buildCoreSessionConfig(config).providerConfig).toEqual(projected);
		expect(buildSessionConnectionUpdate(config).providerConfig).toEqual(
			projected,
		);
	});
	it("clears explicit thinking when restoring backend defaults, across JSON transport", () => {
		const config = JSON.parse(
			JSON.stringify({
				provider: settings.provider,
				model: settings.model,
				thinking: null,
				reasoningEffort: undefined,
			}),
		);
		expect(buildSessionConnectionUpdate(config)).toMatchObject({
			thinking: null,
			reasoningEffort: null,
			thinkingBudgetTokens: null,
		});
		expect(buildCoreSessionConfig(config)).not.toHaveProperty("thinking");
		expect(buildCoreSessionConfig(config)).not.toHaveProperty(
			"reasoningEffort",
		);
	});
	it("does not leak settings into another model and rejects over-limit budgets", () => {
		expect(
			modelSettingsProviderConfig({
				provider: settings.provider,
				model: "other",
				modelSettings: settings,
			}),
		).not.toHaveProperty("modelInfo");
		expect(() =>
			modelSettingsProviderConfig({
				provider: settings.provider,
				model: settings.model,
				modelSettings: { ...settings, contextWindow: 300000 },
			}),
		).toThrow("上限");
		const cleared = buildSessionConnectionUpdate({
			provider: settings.provider,
			model: settings.model,
			modelSettings: { provider: settings.provider, model: settings.model },
		});
		expect(cleared.providerConfig).not.toHaveProperty("modelInfo");
	});
});
