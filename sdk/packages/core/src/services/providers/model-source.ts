import { ModelReasoningOptionSchema, type ModelReasoningOption } from "@cline/shared";

export function parseReasoningOptions(row: Record<string, unknown>): ModelReasoningOption[] | undefined {
	const raw = row.reasoningOptions ?? row.reasoning_options;
	if (Array.isArray(raw)) {
		const parsed = raw.map(value => ModelReasoningOptionSchema.safeParse(value));
		const valid = parsed.flatMap(result => result.success ? [result.data] : []);
		if (valid.length) return valid;
	}
	const efforts = row.supported_reasoning_efforts ?? row.reasoning_efforts;
	if (Array.isArray(efforts)) {
		const parsed = ModelReasoningOptionSchema.safeParse({type: "effort", values: efforts});
		if (parsed.success && efforts.length) return [parsed.data];
	}
	return undefined;
}

function parseModelIdList(input: unknown): string[] {
	if (!Array.isArray(input)) return [];
	return input
		.map((item) => {
			if (typeof item === "string") return item.trim();
			if (item && typeof item === "object") {
				const entry = item as { id?: unknown; name?: unknown; model?: unknown };
				for (const value of [entry.id, entry.name, entry.model]) {
					if (typeof value === "string" && value.trim()) {
						return value.trim();
					}
				}
			}
			return "";
		})
		.filter((id) => id.length > 0);
}

export function extractModelIdsFromPayload(
	payload: unknown,
	providerId: string,
): string[] {
	const rootArray = parseModelIdList(payload);
	if (rootArray.length > 0) return rootArray;
	if (!payload || typeof payload !== "object") return [];

	const data = payload as {
		data?: unknown;
		models?: unknown;
		providers?: Record<string, unknown>;
	};

	const direct = parseModelIdList(data.data ?? data.models);
	if (direct.length > 0) return direct;

	if (
		data.models &&
		typeof data.models === "object" &&
		!Array.isArray(data.models)
	) {
		const keys = Object.keys(data.models).filter((k) => k.trim().length > 0);
		if (keys.length > 0) return keys;
	}

	const scoped = data.providers?.[providerId];
	if (scoped && typeof scoped === "object") {
		const nested = scoped as { models?: unknown };
		const list = parseModelIdList(nested.models ?? scoped);
		if (list.length > 0) return list;
	}

	return [];
}

export async function fetchModelIdsFromSource(
	url: string,
	providerId: string,
	headers?: Record<string, string>,
	onMetadata?: (models: Record<string, { contextWindow?: number; maxInputTokens?: number; maxTokens?: number; reasoningOptions?: ModelReasoningOption[] }>) => void,
): Promise<string[]> {
	const response = await fetch(url, {
		method: "GET",
		...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
	});
	if (!response.ok) {
		throw new Error(
			`failed to fetch models from ${url}: HTTP ${response.status}`,
		);
	}
	const payload = await response.json() as any;
	const rows = Array.isArray(payload) ? payload : payload?.data ?? payload?.models;
	const metadata: Record<string, {contextWindow?: number; maxInputTokens?: number; maxTokens?: number; reasoningOptions?: ModelReasoningOption[]}> = {};
	const positive = (value: unknown): number | undefined =>
		typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
	if (Array.isArray(rows)) for (const row of rows) {
		if (!row || typeof row !== "object" || typeof row.id !== "string") continue;
		const contextWindow = positive(row.context_length) ?? positive(row.contextWindow) ?? positive(row.context_window);
		metadata[row.id.trim()] = {
			reasoningOptions: parseReasoningOptions(row),
			contextWindow,
			maxInputTokens: positive(row.max_input_tokens) ?? positive(row.maxInputTokens) ?? contextWindow,
			maxTokens: positive(row.max_output_tokens) ?? positive(row.maxTokens),
		};
	}
	onMetadata?.(metadata);
	return extractModelIdsFromPayload(payload, providerId);
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

export function resolveModelsSourceUrl(
	baseUrl: string | undefined,
	defaultBaseUrl: string | undefined,
	modelsSourceUrl: string | undefined,
): string | undefined {
	const source = modelsSourceUrl?.trim();
	if (!source) return undefined;
	const configuredBase = baseUrl?.trim();
	if (!configuredBase || !defaultBaseUrl?.trim()) return source;

	try {
		const sourceUrl = new URL(source);
		const defaultBase = new URL(defaultBaseUrl);
		const configured = new URL(configuredBase);
		if (sourceUrl.origin !== defaultBase.origin) return source;

		const defaultPath = trimTrailingSlash(defaultBase.pathname);
		const configuredPath = trimTrailingSlash(configured.pathname);
		if (defaultPath && sourceUrl.pathname.startsWith(`${defaultPath}/`)) {
			const suffix = sourceUrl.pathname.slice(defaultPath.length);
			configured.pathname = `${configuredPath}${suffix}`;
		} else {
			configured.pathname = sourceUrl.pathname;
		}
		configured.search = sourceUrl.search;
		configured.hash = sourceUrl.hash;
		return configured.toString();
	} catch {
		return source;
	}
}
