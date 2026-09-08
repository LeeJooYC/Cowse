import type { ModelReasoningOption } from "@cline/shared/browser";
import { z } from "zod";

/** Host preferences, projected onto Cline's existing modelInfo contract. */
export const ModelRuntimeSettingsSchema = z.object({
	provider: z.string().min(1),
	model: z.string().min(1),
	contextWindow: z
		.number()
		.int()
		.min(1024)
		.max(Number.MAX_SAFE_INTEGER)
		.optional(),
	modelContextLimit: z.number().int().positive().optional(),
	useDefaultBudget: z.boolean().optional(),
	manualContextWindow: z.number().int().min(1024).optional(),
	maxOutputTokens: z.union([z.literal(4096), z.literal(8192), z.literal(16384), z.literal(32768)]).nullable().optional(),
});
export type ModelRuntimeSettings = z.infer<typeof ModelRuntimeSettingsSchema>;

export function contextBudgetSteps(limit?: number): number[] {
	if (!limit || !Number.isSafeInteger(limit) || limit < 1024) return [];
	const cap = Math.min(limit, 262144);
	const steps: number[] = [];
	for (let value = 16384; value <= cap; value *= 2) steps.push(value);
	return steps;
}

export function defaultContextBudget(limit: number): number {
	return Math.min(131072, limit);
}

export function formatContextBudget(value: number): string {
	return value >= 1024
		? `${(value / 1024).toFixed(1).replace(/\.0$/, "")}K`
		: value.toLocaleString();
}

const storageKey = (provider: string, model: string) =>
	`cowse.model-settings:${JSON.stringify([provider, model])}`;

export function readModelRuntimeSettings(
	provider: string,
	model: string,
): ModelRuntimeSettings | undefined {
	try {
		const parsed = ModelRuntimeSettingsSchema.safeParse(
			JSON.parse(
				window.localStorage.getItem(storageKey(provider, model)) ?? "null",
			),
		);
		return parsed.success &&
			parsed.data.provider === provider &&
			parsed.data.model === model
			? parsed.data
			: undefined;
	} catch {
		return undefined;
	}
}

export function saveModelRuntimeSettings(settings: ModelRuntimeSettings): void {
	window.localStorage.setItem(
		storageKey(settings.provider, settings.model),
		JSON.stringify(ModelRuntimeSettingsSchema.parse(settings)),
	);
}

export const REASONING_LABELS: Record<string, string> = {
	on: "开启",
	none: "关闭",
	minimal: "极低",
	low: "低",
	medium: "中",
	high: "高",
	xhigh: "极高",
	max: "最高",
};

export function reasoningChoices(
	options: ModelReasoningOption[] | undefined,
): string[] {
	const values = new Set<string>();
	for (const option of options ?? []) {
		if (option.type === "toggle") values.add("none");
		if (option.type === "effort")
			for (const value of option.values) if (value) values.add(value);
	}
	const efforts = Object.keys(REASONING_LABELS).filter((value) => values.has(value));
	return efforts.some((value) => value !== "none") ? efforts : ["on", "none"];
}
