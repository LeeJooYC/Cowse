import { ProviderSettingsManager, type ProviderConfig } from "@cline/core";
import { ModelRuntimeSettingsSchema } from "../webview/lib/model-runtime-settings";

/** Query only the configured provider, never infer a limit from a model name. */
export async function queryCompatibleContextLimit(
	model: string,
	config: ProviderConfig,
): Promise<number | undefined> {
	if (!config.baseUrl) return undefined;
	const endpoint = new URL(`${config.baseUrl.replace(/\/+$/, "")}/models`);
	const response = await fetch(endpoint, {
		headers: {
			...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
			...config.headers,
		},
		signal: AbortSignal.timeout(5000),
		redirect: "error",
	});
	if (!response.ok) throw new Error("模型上限查询失败");
	const body = (await response.json()) as { data?: Record<string, unknown>[] };
	const entry = body.data?.find((item) => item.id === model);
	if (!entry) return undefined;
	const limits = [
		entry.context_length,
		entry.context_window,
		entry.max_model_len,
		entry.max_input_tokens,
	].filter(
		(value): value is number =>
			typeof value === "number" && Number.isSafeInteger(value) && value >= 1024,
	);
	return limits.length ? Math.min(...limits) : undefined;
}

/** Budget changes affect Core's context manager as well as the UI meter. */
export function modelSettingsProviderConfig(
	config: Record<string, unknown>,
): ProviderConfig {
	const existing = {
		...new ProviderSettingsManager().getProviderConfig(
			String(config.provider ?? config.providerId ?? ""),
			{ includeKnownModels: false },
		),
		...(config.providerConfig && typeof config.providerConfig === "object"
			? config.providerConfig
			: {}),
		providerId: String(config.provider ?? config.providerId ?? ""),
		modelId: String(config.model ?? config.modelId ?? ""),
	};
	const parsed = ModelRuntimeSettingsSchema.safeParse(config.modelSettings);
	if (
		!parsed.success ||
		parsed.data.provider !== (config.provider ?? config.providerId) ||
		parsed.data.model !== (config.model ?? config.modelId)
	)
		return { ...existing };
	const settings = parsed.data;
	if (
		settings.contextWindow &&
		settings.modelContextLimit &&
		settings.contextWindow > settings.modelContextLimit
	)
		throw new Error("上下文预算不能超过模型声明的上限");
	const budget = settings.contextWindow;
	if (!budget) return { ...existing };
	return {
		...existing,
		...(budget ? { maxInputTokens: budget } : {}),
		modelInfo: {
			...(existing.modelInfo?.id === settings.model ? existing.modelInfo : {}),
			id: settings.model,
			name: settings.model,
			...(budget ? { contextWindow: budget, maxInputTokens: budget } : {}),
		},
	};
}
