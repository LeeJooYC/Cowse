"use client";

import { type ReactNode, useEffect, useState } from "react";
import { desktopClient } from "@/lib/desktop-client";
import { Switch } from "@/components/ui/switch";
import {
	contextBudgetSteps,
	defaultContextBudget,
	formatContextBudget,
	type ModelRuntimeSettings,
} from "@/lib/model-runtime-settings";

export function ModelSettingsEditor({
	provider,
	model,
	settings,
	disabled,
	onChange,
	children,
}: {
	provider: string;
	model: string;
	settings?: ModelRuntimeSettings;
	disabled: boolean;
	onChange: (settings: ModelRuntimeSettings) => void;
	/** Keep budget initialization mounted independently of the editor popover. */
	children?: (editor: ReactNode) => ReactNode;
}) {
	const [querying, setQuerying] = useState(true);
	const [serverLimit, setServerLimit] = useState<number>();
	const [error, setError] = useState("");
	const knownLimit =
		serverLimit && Number.isSafeInteger(serverLimit) && serverLimit >= 1024
			? serverLimit
			: undefined;
	// The fallback is a selectable budget range, not a claimed model capacity.
	const upperLimit = knownLimit ?? 262144;
	const steps = contextBudgetSteps(upperLimit);
	const useDefaultBudget = Boolean(
		knownLimit &&
			(steps.length === 0 ||
				(settings?.useDefaultBudget ??
					(settings?.contextWindow === undefined ||
						settings.contextWindow === knownLimit))),
	);
	const requestedBudget =
		settings?.manualContextWindow ??
		settings?.contextWindow ??
		defaultContextBudget(upperLimit);
	const manualBudget =
		steps.filter((value) => value <= requestedBudget).at(-1) ??
		steps[0] ??
		upperLimit;
	const budget = useDefaultBudget ? knownLimit! : manualBudget;
	useEffect(() => {
		let cancelled = false;
		setQuerying(true);
		void desktopClient
			.invoke<{ limit?: number }>("get_model_context_limit", {
				provider,
				model,
			})
			.then((result) => {
				if (!cancelled) setServerLimit(result?.limit);
			})
			.catch(() => {
				if (!cancelled) setServerLimit(undefined);
			})
			.finally(() => {
				if (!cancelled) setQuerying(false);
			});
		return () => {
			cancelled = true;
		};
	}, [provider, model]);
	useEffect(() => {
		if (querying || disabled) return;
		if (
			settings?.contextWindow === budget &&
			settings.modelContextLimit === knownLimit &&
			settings.useDefaultBudget === useDefaultBudget
		)
			return;
		try {
			onChange({
				...settings,
				provider,
				model,
				contextWindow: budget,
				modelContextLimit: knownLimit,
				useDefaultBudget,
			});
		} catch {
			setError("设置保存失败，请重试。");
		}
	}, [
		querying,
		disabled,
		budget,
		useDefaultBudget,
		knownLimit,
		settings,
		provider,
		model,
		onChange,
	]);
	function applyBudget(value: number) {
		if (disabled || querying || !steps.includes(value)) return;
		try {
			onChange({
				...settings,
				provider,
				model,
				contextWindow: value,
				modelContextLimit: knownLimit,
				useDefaultBudget: false,
				manualContextWindow: value,
			});
			setError("");
		} catch {
			setError("设置保存失败，请重试。");
		}
	}
	const editor = (
		<div className="space-y-3 border-t p-3 text-sm">
			{knownLimit && !querying ? (
				<div className="space-y-2">
					<label className="flex items-center justify-between gap-2">
						<span>使用默认预算</span>
						<Switch
							aria-label="使用默认预算"
							checked={useDefaultBudget}
							disabled={disabled || steps.length === 0}
							onCheckedChange={(checked) => {
								try {
									onChange({
										...settings,
										provider,
										model,
										modelContextLimit: knownLimit,
										useDefaultBudget: checked,
										manualContextWindow: manualBudget,
										contextWindow: checked ? knownLimit : manualBudget,
									});
									setError("");
								} catch {
									setError("设置保存失败，请重试。");
								}
							}}
						/>
					</label>
				</div>
			) : null}
			{!useDefaultBudget && (
				<>
					<label className="block space-y-2">
						<span className="flex justify-between">
							<span
								title={
									knownLimit
										? `模型上限：${formatContextBudget(knownLimit)}`
										: "服务端未返回上限，提供 16K～256K 可选预算，不代表模型实际容量"
								}
							>
								上下文预算
							</span>
							<span>{querying ? "查询中…" : formatContextBudget(budget)}</span>
						</span>
						<input
							aria-label="上下文预算"
							aria-valuetext={formatContextBudget(budget)}
							className="w-full accent-primary"
							type="range"
							min={0}
							max={steps.length - 1}
							step={1}
							value={Math.max(steps.indexOf(budget), 0)}
							disabled={disabled || querying || steps.length < 2}
							onChange={(event) =>
								applyBudget(steps[Number(event.target.value)])
							}
						/>
					</label>
					<div className="flex flex-wrap justify-between gap-1">
						{steps.map((value) => (
							<button
								key={value}
								type="button"
								className={`rounded px-1 py-0.5 text-xs disabled:opacity-50 ${value === budget ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
								disabled={disabled || querying}
								aria-pressed={value === budget}
								onClick={() => applyBudget(value)}
							>
								{formatContextBudget(value)}
							</button>
						))}
					</div>
				</>
			)}
			{error && (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			)}
		</div>
	);
	return children ? children(editor) : editor;
}
