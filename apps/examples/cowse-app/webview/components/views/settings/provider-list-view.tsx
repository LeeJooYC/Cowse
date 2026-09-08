"use client";

import {
	ArrowLeft,
	Brain,
	ChevronDown,
	ChevronRight,
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
	FileIcon,
	Globe,
	ImageIcon,
	KeyRound,
	Link as LinkIcon,
	Loader2,
	Mic,
	MonitorSmartphone,
	Plus,
	PlusCircle,
	RefreshCw,
	Search,
	Star,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useOAuthUserCode } from "@/hooks/use-oauth-user-code";
import { openExternalUrl } from "@/lib/desktop-client";
import {
	getProviderAuthKind,
	isProviderConnected,
	type ProviderAuthKind,
} from "@/lib/provider-connection";
import { getProviderApiKeyUrl } from "@/lib/provider-key-urls";
import {
	loadProviderModels,
	supportsAudio,
} from "@/lib/provider-model-catalog";
import type {
	Provider,
	ProviderConfigField,
	ProviderConfigFieldPrimitive,
	ProviderModel,
	ProviderSettingsUpdate,
} from "@/lib/provider-schema";
import { cn } from "@/lib/utils";

// Inputs nested inside a composed bordered box (icon + input + buttons in
// one rounded frame) must strip the Input component's own chrome — border,
// dark-mode bg tint, shadow, focus ring — or the inner field reads as a
// mismatched second box inside the frame.
const EMBEDDED_INPUT_CLASS =
	"h-7 flex-1 border-0 bg-transparent px-0 text-sm shadow-none outline-none placeholder:text-muted-foreground dark:bg-transparent focus-visible:ring-0";

const FAVORITE_MODELS_STORAGE_KEY = "cline.favorite-provider-models.v1";

// Providers whose model lists carry recommended-feed tiers (see the SDK's
// applyClineFeaturedModels). Only these are worth a per-card list fetch.
const FEATURED_PROVIDER_IDS = new Set(["cline", "cline-pass"]);

/** Tier + feed tags rendered as small pills next to the model name. */
function featuredBadges(model: ProviderModel): string[] {
	const featured = model.featured;
	if (!featured) {
		return [];
	}
	const badges: string[] = [];
	if (featured.tier === "recommended") {
		badges.push("推荐");
	} else if (featured.tier === "free") {
		badges.push("免费");
	}
	for (const tag of featured.tags) {
		if (!badges.some((badge) => badge.toLowerCase() === tag.toLowerCase())) {
			badges.push(tag);
		}
	}
	return badges;
}

function readFavoriteModels(): Record<string, string[]> {
	if (typeof window === "undefined") return {};
	try {
		const value = JSON.parse(
			window.localStorage.getItem(FAVORITE_MODELS_STORAGE_KEY) ?? "{}",
		);
		if (!value || typeof value !== "object" || Array.isArray(value)) return {};
		return Object.fromEntries(
			Object.entries(value).filter(
				(entry): entry is [string, string[]] =>
					typeof entry[0] === "string" &&
					Array.isArray(entry[1]) &&
					entry[1].every((modelId) => typeof modelId === "string"),
			),
		);
	} catch {
		return {};
	}
}

function writeFavoriteModels(value: Record<string, string[]>): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(
		FAVORITE_MODELS_STORAGE_KEY,
		JSON.stringify(value),
	);
}

// -----------------------------------------------------------
// Shared bits
// -----------------------------------------------------------

const AUTH_KIND_LABEL: Record<ProviderAuthKind, string> = {
	oauth: "登录",
	local: "本地 CLI",
	"api-key": "API 密钥",
};

function localizeConfigField(field: ProviderConfigField): {
	label: string;
	description?: string;
	placeholder?: string;
} {
	if (field.path === "apiKey") {
		return {
			label: "API 密钥",
			description: "供应商提供的 API 密钥。",
			placeholder: "输入 API 密钥…",
		};
	}
	if (field.path === "baseUrl") {
		return {
			label: "Base URL",
			description: "用于发送供应商请求的基础地址。",
			placeholder: field.placeholder,
		};
	}
	return {
		label: field.label,
		description: field.description,
		placeholder: field.placeholder,
	};
}

function AuthKindHint({ kind }: { kind: ProviderAuthKind }) {
	const Icon =
		kind === "oauth" ? Globe : kind === "local" ? MonitorSmartphone : KeyRound;
	return (
		<span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
			<Icon aria-hidden="true" className="size-3" />
			{AUTH_KIND_LABEL[kind]}
		</span>
	);
}

function getInitialConfigValues(
	provider: Provider,
): Record<string, ProviderConfigFieldPrimitive> {
	const values: Record<string, ProviderConfigFieldPrimitive> = {
		...(provider.configValues ?? {}),
	};
	if (provider.apiKey !== undefined && values.apiKey === undefined) {
		values.apiKey = provider.apiKey;
	}
	if (provider.baseUrl !== undefined && values.baseUrl === undefined) {
		values.baseUrl = provider.baseUrl;
	}
	for (const field of provider.configFields ?? []) {
		if (values[field.path] === undefined && field.defaultValue !== undefined) {
			values[field.path] = field.defaultValue;
		}
	}
	return values;
}

function fieldValueToString(value: ProviderConfigFieldPrimitive | undefined) {
	if (value === undefined || value === null) return "";
	return String(value);
}

function coerceFieldValue(
	field: ProviderConfigField,
	value: string | boolean,
): ProviderConfigFieldPrimitive {
	if (field.type === "boolean") {
		return Boolean(value);
	}
	if (typeof value === "boolean") {
		return value;
	}
	if (field.type === "select") {
		const option = field.options?.find((item) => String(item.value) === value);
		if (option) {
			return option.value;
		}
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}
	if (field.type === "number") {
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return trimmed;
}

// -----------------------------------------------------------
// Provider LIST content
// -----------------------------------------------------------

function ProviderRow({
	provider,
	onConfigure,
	selected,
}: {
	provider: Provider;
	onConfigure: (id: string) => void;
	selected: boolean;
}) {
	const connected = isProviderConnected(provider);
	const authKind = getProviderAuthKind(provider);
	return (
		<button
			className={cn(
				"flex min-h-12 w-full items-center gap-3 border-b px-2 py-2 text-left hover:bg-surface-hover-lighter focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				selected && "bg-surface-hover",
			)}
			onClick={() => onConfigure(provider.id)}
			type="button"
		>
			<p className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
				{provider.name}
			</p>
			{connected ? (
				<span className="shrink-0 text-xs font-medium text-muted-foreground">
					已配置
				</span>
			) : (
				<AuthKindHint kind={authKind} />
			)}
			<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
		</button>
	);
}

function ProviderSectionHeading({
	title,
	description,
}: {
	title: string;
	description?: string;
}) {
	return (
		<div className="mb-2 mt-8 first:mt-0">
			<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
				{title}
			</h2>
			{description ? (
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			) : null}
		</div>
	);
}

export function ProviderListContent({
	providers,
	onConfigure,
	onAddProvider,
	selectedProviderId,
	variant = "page",
}: {
	providers: Provider[];
	onConfigure: (id: string) => void;
	onAddProvider: () => void;
	selectedProviderId?: string | null;
	variant?: "page" | "panel";
}) {
	const [providerSearch, setProviderSearch] = useState("");
	const isPanel = variant === "panel";

	const providerSearchQuery = providerSearch.trim().toLowerCase();
	const filteredProviders = providerSearchQuery
		? providers.filter(
				(provider) =>
					provider.name.toLowerCase().includes(providerSearchQuery) ||
					provider.id.toLowerCase().includes(providerSearchQuery),
			)
		: providers;

	const connectedProviders = filteredProviders.filter(isProviderConnected);
	const availableProviders = filteredProviders.filter(
		(provider) => !isProviderConnected(provider),
	);
	// The catalog arrives sorted by popular rank, then name; "popular" entries
	// surface first so the common providers don't drown in the long tail.
	const popularProviders = availableProviders.filter((provider) =>
		provider.capabilities?.includes("popular"),
	);
	const otherProviders = availableProviders.filter(
		(provider) => !provider.capabilities?.includes("popular"),
	);
	const connectedCount = providers.filter(isProviderConnected).length;

	const renderRows = (entries: Provider[]) => (
		<div className="overflow-hidden border-t">
			{entries.map((provider) => (
				<ProviderRow
					key={provider.id}
					onConfigure={onConfigure}
					provider={provider}
					selected={selectedProviderId === provider.id}
				/>
			))}
		</div>
	);

	return (
		<ScrollArea className="page-scroll-area h-full min-w-0">
			<div className="page-content">
				<div className="mb-6 flex w-full flex-wrap items-start justify-between gap-6">
					<div className="min-w-0 flex-[1_1_18rem]">
						<h1
							className={cn(
								"truncate font-semibold leading-[1.15] text-foreground",
								isPanel ? "text-2xl" : "text-3xl",
							)}
						>
							模型供应商
						</h1>
						<p className="mt-3 text-base leading-6 text-muted-foreground">
							{connectedCount === 0
								? "连接供应商后即可开始使用模型。"
								: `已配置 ${connectedCount} 个 · 共 ${providers.length} 个可用`}
						</p>
					</div>
					<Button
						className="h-8 shrink-0 rounded-md bg-foreground px-3 text-sm text-background hover:bg-foreground/90"
						onClick={onAddProvider}
						type="button"
					>
						<PlusCircle className="size-4" />
						添加供应商
					</Button>
				</div>

				<div className="mb-6 w-full min-w-0">
					<div className="flex h-9 items-center gap-2 rounded border bg-background px-3">
						<Search className="size-4 shrink-0 text-muted-foreground" />
						<Input
							aria-label="搜索模型供应商"
							className={EMBEDDED_INPUT_CLASS}
							onChange={(event) => setProviderSearch(event.target.value)}
							placeholder="搜索供应商"
							value={providerSearch}
						/>
						{providerSearch ? (
							<button
								aria-label="清除供应商搜索"
								className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
								onClick={() => setProviderSearch("")}
								type="button"
							>
								<X className="size-3.5" />
							</button>
						) : null}
					</div>
				</div>

				<div className="w-full min-w-0">
					{filteredProviders.length === 0 ? (
						<div className="border-y px-2 py-6 text-base text-muted-foreground">
							没有与“{providerSearch.trim()}”匹配的供应商。
						</div>
					) : null}

					{connectedProviders.length > 0 ? (
						<>
							<ProviderSectionHeading title="已配置" />
							{renderRows(connectedProviders)}
						</>
					) : null}

					{popularProviders.length > 0 ? (
						<>
							<ProviderSectionHeading
								description={
									connectedProviders.length === 0 && !providerSearchQuery
										? "登录或添加 API 密钥以连接。"
										: undefined
								}
								title="常用"
							/>
							{renderRows(popularProviders)}
						</>
					) : null}

					{otherProviders.length > 0 ? (
						<>
							<ProviderSectionHeading title="全部供应商" />
							{renderRows(otherProviders)}
						</>
					) : null}
				</div>
			</div>
		</ScrollArea>
	);
}

// -----------------------------------------------------------
// Provider DETAIL content
// -----------------------------------------------------------

function ConfigFieldRow({
	field,
	value,
	provider,
	shown,
	onToggleShown,
	onDraftChange,
	onCommit,
}: {
	field: ProviderConfigField;
	value: ProviderConfigFieldPrimitive | undefined;
	provider: Provider;
	shown: boolean;
	onToggleShown: () => void;
	onDraftChange: (value: string) => void;
	onCommit: (value: string | boolean) => void;
}) {
	const valueText = fieldValueToString(value);
	const localizedField = localizeConfigField(field);
	const isSecret = field.type === "password" || field.secret;
	const providerKeyUrl = getProviderApiKeyUrl(provider);
	return (
		<div className="provider-config-field-row grid min-h-18 grid-cols-[minmax(12rem,0.55fr)_minmax(16rem,0.45fr)] items-center gap-6 border-b py-4">
			<header>
				<h3 className="text-lg font-semibold text-foreground">
					{localizedField.label}
				</h3>
				{localizedField.description ? (
					<p className="mt-1 text-base leading-relaxed text-muted-foreground">
						{localizedField.description}
					</p>
				) : null}
				{field.path === "apiKey" && providerKeyUrl ? (
					<button
						className="mt-1 inline-flex items-center gap-1 text-sm text-primary underline-offset-2 transition-colors hover:underline"
						onClick={() => void openExternalUrl(providerKeyUrl)}
						type="button"
					>
						{provider.docLabel || `获取 ${provider.name} API 密钥`}
						<ExternalLink className="size-3.5" />
					</button>
				) : null}
			</header>
			{field.type === "boolean" ? (
				<div className="flex items-center justify-end">
					<span className="text-sm text-muted-foreground">{field.label}</span>
					<Switch
						checked={Boolean(value)}
						onCheckedChange={(checked) => onCommit(checked)}
					/>
				</div>
			) : field.type === "select" ? (
				<select
					className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
					onChange={(event) => onCommit(event.target.value)}
					value={valueText}
				>
					<option value="">未设置</option>
					{field.options?.map((option) => (
						<option key={String(option.value)} value={String(option.value)}>
							{option.label}
						</option>
					))}
				</select>
			) : (
				<div className="flex h-9 items-center gap-2 rounded border border-border bg-background px-3">
					{field.type === "url" ? (
						<LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
					) : null}
					<Input
						className={EMBEDDED_INPUT_CLASS}
						onBlur={() => onCommit(valueText)}
						onChange={(event) => onDraftChange(event.target.value)}
						placeholder={localizedField.placeholder}
						spellCheck={false}
						type={
							isSecret && !shown
								? "password"
								: field.type === "number"
									? "number"
									: field.type === "url"
										? "url"
										: "text"
						}
						value={valueText}
					/>
					{isSecret ? (
						<>
							<Button
								aria-label={shown ? "隐藏密钥" : "显示密钥"}
								className="rounded-md p-1 text-muted-foreground hover:text-foreground "
								onClick={onToggleShown}
								variant="ghost"
							>
								{shown ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
							</Button>
							<Button
								aria-label={`复制${localizedField.label}`}
								className="rounded-md p-1 text-muted-foreground hover:text-foreground "
								onClick={() => navigator.clipboard.writeText(valueText)}
								variant="ghost"
							>
								<Copy className="h-4 w-4" />
							</Button>
						</>
					) : null}
				</div>
			)}
		</div>
	);
}

export function ProviderDetailContent({
	provider,
	onBack,
	onUpdate,
	onLoadModels,
	onUpdateModels,
	modelsLoading = false,
	modelsError,
	onOAuthLogin,
	oauthLoginPending = false,
	oauthLoginError,
	onRefreshAuth,
	onConnect,
	onDisconnect,
	variant = "page",
}: {
	provider: Provider;
	onBack: () => void;
	onUpdate: (updates: ProviderSettingsUpdate) => void;
	onLoadModels?: () => void;
	onUpdateModels?: (models: string[]) => void;
	modelsLoading?: boolean;
	modelsError?: string | null;
	onOAuthLogin?: () => void;
	oauthLoginPending?: boolean;
	oauthLoginError?: string | null;
	onRefreshAuth?: () => void;
	onConnect?: () => void;
	onDisconnect?: () => void;
	variant?: "page" | "panel";
}) {
	const deviceUserCode = useOAuthUserCode(oauthLoginPending);
	const [shownSecrets, setShownSecrets] = useState<Record<string, boolean>>({});
	const [localConfigValues, setLocalConfigValues] = useState<
		Record<string, ProviderConfigFieldPrimitive>
	>(() => getInitialConfigValues(provider));
	const [manualKeyExpanded, setManualKeyExpanded] = useState(false);
	const [modelSearchState, setModelSearchState] = useState<{
		providerId: string;
		value: string;
	} | null>(null);
	const [copiedModelState, setCopiedModelState] = useState<{
		modelId: string;
		providerId: string;
	} | null>(null);
	const [addModelState, setAddModelState] = useState<{
		providerId: string;
		value: string;
	} | null>(null);
	const [favoriteModels, setFavoriteModels] = useState(readFavoriteModels);
	const copiedModelTimeoutRef = useRef<number | undefined>(undefined);

	const authKind = getProviderAuthKind(provider);
	const connected = isProviderConnected(provider);
	const configFields = provider.configFields ?? [];
	const apiKeyField = configFields.find((field) => field.path === "apiKey");
	const apiKeyValue = fieldValueToString(localConfigValues.apiKey);
	// The catalog's modelList is fetched without the recommended-feed overlay
	// (the catalog must not block on the feed); featured providers refresh
	// their list here so tier badges and live entries can render. The result
	// is scoped to the provider AND the modelList revision it was fetched
	// for: an unscoped copy kept shadowing the next provider's models after
	// a switch (even when its own request failed) and masked membership
	// updates — adding a model would then submit the stale list as the
	// complete configuration and drop earlier additions.
	const [featuredModelList, setFeaturedModelList] = useState<{
		providerId: string;
		baseModelList: Provider["modelList"];
		models: ProviderModel[];
	} | null>(null);
	useEffect(() => {
		if (!FEATURED_PROVIDER_IDS.has(provider.id)) {
			return;
		}
		let cancelled = false;
		loadProviderModels(provider.id)
			.then((models) => {
				if (!cancelled && models.length > 0) {
					setFeaturedModelList({
						providerId: provider.id,
						baseModelList: provider.modelList,
						models,
					});
				}
			})
			.catch(() => {
				// Keep the catalog snapshot when the refresh fails.
			});
		return () => {
			cancelled = true;
		};
	}, [provider.id, provider.modelList]);
	const modelList =
		featuredModelList &&
		featuredModelList.providerId === provider.id &&
		featuredModelList.baseModelList === provider.modelList
			? featuredModelList.models
			: (provider.modelList ?? []);
	const modelSearch =
		modelSearchState?.providerId === provider.id ? modelSearchState.value : "";
	const copiedModelId =
		copiedModelState?.providerId === provider.id
			? copiedModelState.modelId
			: null;
	const isAddingModel = addModelState?.providerId === provider.id;
	const newModelId = isAddingModel ? addModelState.value : "";
	const modelSearchQuery = modelSearch.trim().toLowerCase();
	const matchingModelList = modelSearchQuery
		? modelList.filter(
				(model) =>
					model.name.toLowerCase().includes(modelSearchQuery) ||
					model.id.toLowerCase().includes(modelSearchQuery),
			)
		: modelList;
	const favoriteModelIds = new Set(favoriteModels[provider.id] ?? []);
	const filteredModelList = [...matchingModelList].sort(
		(a, b) =>
			Number(favoriteModelIds.has(b.id)) - Number(favoriteModelIds.has(a.id)),
	);
	const isPanel = variant === "panel";

	useEffect(
		() => () => {
			if (copiedModelTimeoutRef.current !== undefined) {
				window.clearTimeout(copiedModelTimeoutRef.current);
			}
		},
		[],
	);

	const commitField = (
		field: ProviderConfigField,
		rawValue: string | boolean,
	) => {
		const value = coerceFieldValue(field, rawValue);
		const nextConfigValues = {
			...localConfigValues,
			[field.path]: value,
		};
		setLocalConfigValues(nextConfigValues);

		const updates: ProviderSettingsUpdate = {
			configValues: { [field.path]: value },
		};
		if (field.path === "apiKey") {
			updates.apiKey = fieldValueToString(value);
		}
		if (field.path === "baseUrl") {
			updates.baseUrl = fieldValueToString(value);
		}
		onUpdate(updates);
	};

	const handleDisconnect = () => {
		// The persisted entry is being removed; clear the local drafts so
		// stale secrets don't linger in the inputs.
		setShownSecrets({});
		setManualKeyExpanded(false);
		setLocalConfigValues(
			getInitialConfigValues({
				...provider,
				apiKey: undefined,
				configValues: undefined,
			}),
		);
		onDisconnect?.();
	};

	const renderConfigFieldRow = (field: ProviderConfigField) => (
		<ConfigFieldRow
			field={field}
			key={field.path}
			onCommit={(value) => commitField(field, value)}
			onDraftChange={(value) =>
				setLocalConfigValues((current) => ({
					...current,
					[field.path]: value,
				}))
			}
			onToggleShown={() =>
				setShownSecrets((current) => ({
					...current,
					[field.path]: !(current[field.path] ?? false),
				}))
			}
			provider={provider}
			shown={shownSecrets[field.path] ?? false}
			value={localConfigValues[field.path]}
		/>
	);

	const copyModelId = (modelId: string) => {
		if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
			return;
		}
		void navigator.clipboard.writeText(modelId).then(() => {
			setCopiedModelState({ modelId, providerId: provider.id });
			if (copiedModelTimeoutRef.current !== undefined) {
				window.clearTimeout(copiedModelTimeoutRef.current);
			}
			copiedModelTimeoutRef.current = window.setTimeout(
				() => setCopiedModelState(null),
				1600,
			);
		});
	};

	const addModel = () => {
		const modelId = newModelId.trim();
		// Submit the union of the displayed and configured lists: the update
		// replaces the provider's complete model configuration, so basing it
		// on the displayed list alone could silently drop configured entries
		// whenever the two diverge.
		const baseIds = [
			...new Set([
				...modelList.map((model) => model.id),
				...(provider.modelList ?? []).map((model) => model.id),
			]),
		];
		if (!modelId || baseIds.includes(modelId)) {
			return;
		}
		onUpdateModels?.([...baseIds, modelId]);
		setAddModelState(null);
	};

	const toggleFavoriteModel = (modelId: string) => {
		setFavoriteModels((current) => {
			const providerFavorites = new Set(current[provider.id] ?? []);
			if (providerFavorites.has(modelId)) providerFavorites.delete(modelId);
			else providerFavorites.add(modelId);
			const next = {
				...current,
				[provider.id]: Array.from(providerFavorites),
			};
			writeFavoriteModels(next);
			return next;
		});
	};

	const oauthConnected = Boolean(provider.oauthAccessTokenPresent);

	const connectionSection =
		authKind === "oauth" ? (
			<section className="mb-8 w-full min-w-0">
				{oauthConnected ? (
					<div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
						<div className="min-w-0">
							<p className="text-sm font-medium text-foreground">
								已通过浏览器登录
							</p>
							<p className="text-xs text-muted-foreground">
								此供应商使用你的账户进行身份验证，无需 API 密钥。
							</p>
						</div>
						{onDisconnect ? (
							<Button
								className="shrink-0"
								onClick={handleDisconnect}
								size="sm"
								type="button"
								variant="outline"
							>
								退出登录
							</Button>
						) : null}
					</div>
				) : connected && apiKeyValue ? (
					<div className="flex flex-col">
						<div className="mb-2 flex items-center justify-between gap-4">
							<p className="text-sm text-muted-foreground">
								已使用 API 密钥配置。
							</p>
							{onDisconnect ? (
								<Button
									className="shrink-0"
									onClick={handleDisconnect}
									size="sm"
									type="button"
									variant="outline"
								>
									断开连接
								</Button>
							) : null}
						</div>
						{apiKeyField ? renderConfigFieldRow(apiKeyField) : null}
					</div>
				) : (
					<div className="rounded-lg border px-4 py-4">
						<p className="text-sm font-medium text-foreground">
							登录 {provider.name}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							通过浏览器连接，无需 API 密钥。
						</p>
						{onOAuthLogin ? (
							<Button
								className="mt-3 inline-flex items-center gap-2"
								disabled={oauthLoginPending}
								onClick={onOAuthLogin}
								type="button"
								variant="default"
							>
								{oauthLoginPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : null}
								<span>
									{oauthLoginPending ? "正在完成登录…" : "使用浏览器登录"}
								</span>
							</Button>
						) : null}
						{oauthLoginPending && deviceUserCode ? (
							<p className="mt-3 text-xs text-muted-foreground">
								请在浏览器中确认此代码：{" "}
								<span className="font-mono font-medium text-foreground">
									{deviceUserCode}
								</span>
							</p>
						) : null}
						{onRefreshAuth ? (
							<Button
								className="ml-2"
								variant="outline"
								type="button"
								onClick={onRefreshAuth}
							>
								刷新登录状态
							</Button>
						) : null}
						<p className="mt-3 text-xs text-muted-foreground">
							浏览器完成授权后，还需等待牛马保存登录凭据。以此处显示“已通过浏览器登录”为准；下方模型列表不代表已登录。
						</p>
						{oauthLoginError ? (
							<p
								role="alert"
								className="mt-3 break-words text-sm text-destructive"
							>
								登录未完成：{oauthLoginError}
							</p>
						) : null}
						{apiKeyField ? (
							<div className="mt-3">
								<Button
									aria-expanded={manualKeyExpanded}
									className="-ml-2"
									onClick={() => setManualKeyExpanded((open) => !open)}
									size="sm"
									type="button"
									variant="ghost"
								>
									改用 API 密钥
									<ChevronDown
										aria-hidden="true"
										className={cn(
											"size-3.5 transition-transform",
											manualKeyExpanded && "rotate-180",
										)}
									/>
								</Button>
								{manualKeyExpanded ? (
									<div className="mt-1">
										{renderConfigFieldRow(apiKeyField)}
									</div>
								) : null}
							</div>
						) : null}
					</div>
				)}
			</section>
		) : authKind === "local" ? (
			<section className="mb-8 w-full min-w-0">
				<div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
					<div className="min-w-0">
						<p className="text-sm font-medium text-foreground">
							使用本机 CLI 登录状态
						</p>
						<p className="text-xs text-muted-foreground">
							凭据来自本机上的供应商 CLI，无需 API 密钥。
						</p>
					</div>
					{connected
						? onDisconnect && (
								<Button
									className="shrink-0"
									onClick={handleDisconnect}
									size="sm"
									type="button"
									variant="outline"
								>
									断开连接
								</Button>
							)
						: onConnect && (
								<Button
									className="shrink-0"
									onClick={onConnect}
									size="sm"
									type="button"
								>
									连接
								</Button>
							)}
				</div>
			</section>
		) : (
			<section className="mb-8 w-full min-w-0">
				{configFields.length > 0 ? (
					<div className="flex flex-col">
						{configFields.map(renderConfigFieldRow)}
					</div>
				) : null}
				<div className="mt-4 flex items-center justify-between gap-4">
					{connected ? (
						<>
							<p className="text-xs text-muted-foreground">
								上方字段的更改会自动保存。
							</p>
							{onDisconnect ? (
								<Button
									className="shrink-0"
									onClick={handleDisconnect}
									size="sm"
									type="button"
									variant="outline"
								>
									断开连接
								</Button>
							) : null}
						</>
					) : (
						<>
							<p className="text-xs text-muted-foreground">
								保存 API
								密钥会自动配置此供应商。如果它从环境或本地端点读取凭据，请点击“连接”。
							</p>
							{onConnect ? (
								<Button
									className="shrink-0"
									onClick={onConnect}
									size="sm"
									type="button"
									variant="outline"
								>
									连接
								</Button>
							) : null}
						</>
					)}
				</div>
			</section>
		);

	return (
		<ScrollArea className="page-scroll-area provider-detail-layout h-full min-w-0">
			<div className="page-content">
				<div className="mb-8 flex items-center gap-3">
					<Button
						aria-label="返回供应商列表"
						className={cn(
							"rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground",
						)}
						onClick={onBack}
						variant="ghost"
					>
						<ArrowLeft className="size-4" />
					</Button>
					<h1
						className={cn(
							"min-w-0 flex-1 truncate font-semibold leading-[1.15] text-foreground",
							isPanel ? "text-2xl" : "text-3xl",
						)}
					>
						{provider.name}
					</h1>
					<span className="inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
						{connected ? "已配置" : "未配置"}
					</span>
				</div>

				{connectionSection}

				{/* Models section */}
				<section className="w-full min-w-0 overflow-hidden rounded-lg border">
					<div className="flex h-12 items-center justify-between bg-muted/40 px-4">
						<div className="flex items-center gap-1">
							<h2 className="mr-1 text-lg font-medium text-muted-foreground">
								模型
							</h2>
							<Button
								aria-label="刷新模型"
								className="size-4 rounded-none p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
								disabled={modelsLoading}
								onClick={onLoadModels}
								variant="ghost"
							>
								<RefreshCw
									className={cn("size-4", modelsLoading && "animate-spin")}
								/>
							</Button>
						</div>
						{onUpdateModels ? (
							<Button
								aria-label="添加模型"
								className="size-4 rounded-none p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
								disabled={modelsLoading}
								onClick={() =>
									setAddModelState({ providerId: provider.id, value: "" })
								}
								variant="ghost"
							>
								<Plus className="size-4" />
							</Button>
						) : null}
					</div>
					{isAddingModel ? (
						<div className="flex items-center gap-2 border-t px-4 py-3">
							<Input
								aria-label="新模型 ID"
								autoFocus
								className="h-9 flex-1 font-mono"
								onChange={(event) =>
									setAddModelState({
										providerId: provider.id,
										value: event.target.value,
									})
								}
								onKeyDown={(event) => {
									if (event.key === "Enter") addModel();
									if (event.key === "Escape") setAddModelState(null);
								}}
								placeholder="模型 ID"
								value={newModelId}
							/>
							<Button
								disabled={!newModelId.trim()}
								onClick={addModel}
								size="sm"
							>
								添加
							</Button>
							<Button
								onClick={() => setAddModelState(null)}
								size="sm"
								variant="ghost"
							>
								取消
							</Button>
						</div>
					) : null}

					{modelsError ? (
						<div className="border-t border-destructive/30 bg-destructive/5 px-4 py-2">
							<p className="text-sm text-destructive">{modelsError}</p>
						</div>
					) : null}
					{modelList.length > 0 ? (
						<div className="space-y-3">
							<div className="mx-4 mt-4 flex h-9 items-center gap-2 rounded border bg-background px-3">
								<Search className="size-4 shrink-0 text-muted-foreground" />
								<Input
									aria-label="搜索模型"
									className={EMBEDDED_INPUT_CLASS}
									onChange={(event) =>
										setModelSearchState({
											providerId: provider.id,
											value: event.target.value,
										})
									}
									placeholder="按名称或 ID 搜索模型"
									spellCheck={false}
									value={modelSearch}
								/>
							</div>
							{filteredModelList.length > 0 ? (
								<div className="border-t">
									{filteredModelList.map((model) => (
										<div
											className="group flex min-h-16 items-center gap-3 border-b px-4 py-3 hover:bg-surface-hover-lighter"
											key={model.id}
										>
											<div className="min-w-0 flex-1 font-mono">
												<div className="flex min-w-0 items-center gap-1.5 px-1 text-sm text-foreground">
													<span className="truncate">{model.name}</span>
													{featuredBadges(model).map((badge) => (
														<span
															className="inline-flex shrink-0 items-center rounded bg-surface-hover px-1 py-px font-sans text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground"
															key={badge}
														>
															{badge}
														</span>
													))}
													{/* Capability icons */}
													{model.supportsAttachments && (
														<span
															aria-label="支持文件"
															role="img"
															title="支持文件"
														>
															<FileIcon
																aria-hidden="true"
																className="h-3.5 w-3.5 text-muted-foreground"
															/>
														</span>
													)}
													{model.supportsVision && (
														<span
															aria-label="支持图片"
															role="img"
															title="支持图片"
														>
															<ImageIcon
																aria-hidden="true"
																className="h-3.5 w-3.5 text-muted-foreground"
															/>
														</span>
													)}
													{supportsAudio(model) && (
														<span
															aria-label="支持音频"
															role="img"
															title="支持音频"
														>
															<Mic
																aria-hidden="true"
																className="h-3.5 w-3.5 text-muted-foreground"
															/>
														</span>
													)}
													{model.supportsReasoning && (
														<span
															aria-label="支持推理"
															role="img"
															title="支持推理"
														>
															<Brain
																aria-hidden="true"
																className="h-3.5 w-3.5 text-muted-foreground"
															/>
														</span>
													)}
												</div>
												{model.description ? (
													<p className="mt-0.5 truncate px-1 font-sans text-xs text-muted-foreground">
														{model.description}
													</p>
												) : null}
												<button
													aria-label={`复制模型 ID ${model.id}`}
													className="mt-1 flex max-w-full items-center gap-1.5 px-1 text-left text-xs text-muted-foreground  hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													onClick={() => copyModelId(model.id)}
													title="复制模型 ID"
													type="button"
												>
													<span className="min-w-0 truncate">{model.id}</span>
													<Copy className="size-3 shrink-0" />
													{copiedModelId === model.id ? (
														<span className="shrink-0 text-foreground">
															已复制
														</span>
													) : null}
												</button>
											</div>

											<Button
												aria-label={
													favoriteModelIds.has(model.id)
														? `取消收藏 ${model.name}`
														: `收藏 ${model.name}`
												}
												className={cn(
													"ml-auto shrink-0 rounded-md p-1.5 transition-colors hover:bg-surface-hover hover:text-foreground",
													favoriteModelIds.has(model.id)
														? "text-amber-400"
														: "text-muted-foreground",
												)}
												onClick={() => toggleFavoriteModel(model.id)}
												variant="ghost"
											>
												<Star
													className={cn(
														"size-4",
														favoriteModelIds.has(model.id) && "fill-current",
													)}
												/>
											</Button>
										</div>
									))}
								</div>
							) : (
								<div className="rounded-lg border border-border px-4 py-8 text-center">
									<p className="text-sm text-muted-foreground">
										没有与“{modelSearch.trim()}”匹配的模型。
									</p>
								</div>
							)}
						</div>
					) : (
						<div className="rounded-lg border border-border px-4 py-8 text-center">
							<p className="text-sm text-muted-foreground">
								{modelsLoading
									? "正在加载模型…"
									: "暂无可用模型。点击刷新加载模型。"}
							</p>
						</div>
					)}
				</section>
			</div>
		</ScrollArea>
	);
}
