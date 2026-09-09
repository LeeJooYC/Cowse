import { providerOffersModelTool } from "@cline/llms/browser";
import { Import, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImportSessionsDialog } from "@/components/import-sessions-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { isBetaVersion, productNameForVersion } from "@/lib/app-channel";
import {
	DEFAULT_APP_FONT_SIZE,
	isAppFontSize,
	MAX_APP_FONT_SIZE,
	MIN_APP_FONT_SIZE,
	readStoredAppFontSize,
	setStoredAppFontSize,
	subscribeToAppFontSize,
} from "@/lib/app-font-size";
import { desktopClient } from "@/lib/desktop-client";
import { resetOnboarding } from "@/lib/onboarding";
import { getProviderAuthKind } from "@/lib/provider-connection";
import {
	fetchProviderCatalog,
	invalidateProviderCatalogCache,
	notifyVoiceInputSettingsChanged,
	publishProviderModels,
	subscribeToProviderCatalogInvalidation,
} from "@/lib/provider-model-catalog";
import type {
	Provider,
	ProviderCatalogResponse,
	ProviderModelsResponse,
	ProviderSettingsUpdate,
} from "@/lib/provider-schema";
import {
	type HubAccent,
	type HubTheme,
	readStoredHubAccent,
	readStoredHubTheme,
	readSystemHubTheme,
	setStoredHubAccent,
	setStoredHubTheme,
	watchSystemHubTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
	LANGUAGE_OPTIONS,
	readPreferredLanguage,
	savePreferredLanguage,
	normalizePreferredLanguage,
} from "@/lib/preferred-language";
import { MarketplaceExplorerView } from "../marketplace-explorer-view";
import { PageFrame, PageHeader } from "../page-layout";
import { AccountView } from "./account-view";
import { AddProviderContent, type AddProviderPayload } from "./add-provider";
import { ChannelsContent } from "./channels-view";
import { CustomizeView } from "./customize-view";
import { NotificationSettings } from "./notification-settings";
import {
	ProviderDetailContent,
	ProviderListContent,
} from "./provider-list-view";
import { ProxySettings } from "./proxy-settings";
import { FullQuitSettings } from "./full-quit-settings";
import { RoutineSchedulesContent } from "./routine-view";
import type { SettingsSection } from "./sections";
import { toSettingsPatch } from "./settings-patch";
import { VoiceInputContent } from "./voice-input-view";

// Nav categories live in ./sections so the always-mounted sidebar can import
// them without pulling this module graph into the initial bundle.
export {
	CUSTOMIZATION_SECTIONS,
	SETTINGS_SECTIONS,
	type SettingsSection,
} from "./sections";

type GlobalSettingsResponse = {
	telemetryOptOut: boolean;
	tools?: Partial<Record<"web_search", { enabled: boolean }>>;
};

const PROVIDER_CATALOG_CACHE_TTL_MS = 60_000;

let providerCatalogCache: {
	providers: Provider[];
	fetchedAt: number;
} | null = null;

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------

export function SettingsView({
	section,
	onNavigateSection,
	onOpenSession,
}: {
	section: SettingsSection;
	onNavigateSection: (section: SettingsSection) => void;
	onOpenSession?: (sessionId: string) => void | Promise<void>;
}) {
	const activeNav = section;
	const [providers, setProviders] = useState<Provider[]>(
		() => providerCatalogCache?.providers ?? [],
	);
	const [providersLoading, setProvidersLoading] = useState(
		() => !providerCatalogCache,
	);
	const [providerCatalogError, setProviderCatalogError] = useState<
		string | null
	>(null);
	const [modelsLoadingByProvider, setModelsLoadingByProvider] = useState<
		Record<string, boolean>
	>({});
	const [modelsErrorByProvider, setModelsErrorByProvider] = useState<
		Record<string, string | null>
	>({});
	const [oauthSigningProviderId, setOauthSigningProviderId] = useState<
		string | null
	>(null);
	const [oauthErrors, setOauthErrors] = useState<Record<string, string | null>>(
		{},
	);
	const oauthAttemptRef = useRef(0);
	const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
		null,
	);
	const [addingProvider, setAddingProvider] = useState(false);
	// Bumped by every optimistic provider mutation and catalog load. An
	// in-flight catalog response is discarded when the generation moved on,
	// so an older disk snapshot can never overwrite a newer edit.
	const catalogGenerationRef = useRef(0);
	// Bumped when a failed save resyncs the catalog from disk; keys the
	// detail panel so its local field drafts remount from the reloaded
	// props instead of keeping unpersisted values.
	const [detailResetToken, setDetailResetToken] = useState(0);

	useEffect(() => {
		if (section !== "Models") {
			setSelectedProviderId(null);
			setAddingProvider(false);
		}
	}, [section]);

	const setProvidersWithCache = useCallback(
		(next: Provider[] | ((prev: Provider[]) => Provider[])) => {
			setProviders((prev) => {
				const resolved =
					typeof next === "function"
						? (next as (prev: Provider[]) => Provider[])(prev)
						: next;
				providerCatalogCache = {
					providers: resolved,
					fetchedAt: Date.now(),
				};
				return resolved;
			});
		},
		[],
	);

	/**
	 * Loads the catalog into view state. Resolves to false when the response
	 * was discarded because a newer mutation or load superseded it while in
	 * flight (so an older disk snapshot never overwrites a newer edit);
	 * callers needing an authoritative resync should retry on false.
	 */
	const loadProviderCatalog = useCallback(
		async (fresh = false): Promise<boolean> => {
			const now = Date.now();
			if (
				!fresh &&
				providerCatalogCache &&
				now - providerCatalogCache.fetchedAt < PROVIDER_CATALOG_CACHE_TTL_MS
			) {
				setProviders(providerCatalogCache.providers);
				setProvidersLoading(false);
				setProviderCatalogError(null);
				return true;
			}

			const generation = ++catalogGenerationRef.current;
			setProvidersLoading(true);
			setProviderCatalogError(null);
			try {
				const payload = await desktopClient.invoke<ProviderCatalogResponse>(
					"list_provider_catalog",
				);
				if (generation !== catalogGenerationRef.current) {
					return false;
				}
				setProvidersWithCache(payload.providers);
			} catch (error) {
				if (generation !== catalogGenerationRef.current) {
					return false;
				}
				const message = error instanceof Error ? error.message : String(error);
				setProviderCatalogError(message);
				setProviders([]);
			} finally {
				setProvidersLoading(false);
			}
			return true;
		},
		[setProvidersWithCache],
	);

	useEffect(() => {
		if (activeNav !== "Models") {
			return;
		}
		const timeoutId = window.setTimeout(() => {
			void loadProviderCatalog(true);
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, [activeNav, loadProviderCatalog]);

	/**
	 * Silently refreshes view state from the authoritative catalog after a
	 * successful save, without toggling the loading screen. Optimistic
	 * mutations can't know sidecar-computed fields (`configured`), so the
	 * Configured badge would otherwise stay stale until a remount. Claims a
	 * new generation like loadProviderCatalog, so overlapping resyncs, loads,
	 * and edits always resolve to the newest snapshot: anything older still
	 * in flight is discarded on arrival.
	 */
	const resyncProviderCatalog = useCallback(async () => {
		const generation = ++catalogGenerationRef.current;
		try {
			const payload = await desktopClient.invoke<ProviderCatalogResponse>(
				"list_provider_catalog",
			);
			if (generation !== catalogGenerationRef.current) {
				return;
			}
			setProvidersWithCache(payload.providers);
		} catch {
			// Background refresh only; the optimistic state remains until the
			// next full load.
		}
	}, [setProvidersWithCache]);

	useEffect(() => {
		if (activeNav !== "Models") return;
		const refresh = () => {
			invalidateProviderCatalogCache();
			void resyncProviderCatalog();
		};
		const onVisible = () => {
			if (document.visibilityState === "visible") refresh();
		};
		window.addEventListener("focus", refresh);
		document.addEventListener("visibilitychange", onVisible);
		const unsubscribe = desktopClient.subscribe(
			"provider_auth_changed",
			refresh,
		);
		return () => {
			window.removeEventListener("focus", refresh);
			document.removeEventListener("visibilitychange", onVisible);
			unsubscribe();
		};
	}, [activeNav, resyncProviderCatalog]);

	const persistProviderSettings = useCallback(
		async (
			id: string,
			updates: {
				enabled?: boolean;
				apiKey?: string;
				baseUrl?: string;
				configValues?: ProviderSettingsUpdate["configValues"];
			},
		): Promise<boolean> => {
			try {
				await desktopClient.invoke("save_provider_settings", {
					provider: id,
					enabled: updates.enabled,
					api_key: updates.apiKey,
					base_url: updates.baseUrl,
					settings: updates.configValues
						? toSettingsPatch(updates.configValues)
						: undefined,
				});
				// Pick up sidecar-computed readiness (`configured`) for the
				// just-saved settings so the Configured badge and count update
				// without a remount.
				void resyncProviderCatalog();
				return true;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				window.alert(`Failed to save provider settings for ${id}: ${message}`);
				// The optimistic list update no longer matches disk: resync from
				// the authoritative catalog. Retry when a concurrent edit
				// superseded the in-flight response (that edit performs no
				// reload of its own), then remount the detail panel so its
				// field drafts re-seed from the reloaded state — not before,
				// or they would re-capture the unpersisted optimistic values.
				for (let attempt = 0; attempt < 3; attempt++) {
					providerCatalogCache = null;
					if (await loadProviderCatalog()) {
						break;
					}
				}
				setDetailResetToken((token) => token + 1);
				return false;
			} finally {
				// Keep the shared short-lived catalog cache (composer model
				// selector, onboarding) in sync with the just-saved settings.
				invalidateProviderCatalogCache();
			}
		},
		[loadProviderCatalog, resyncProviderCatalog],
	);

	const providerDraftsRef = useRef<Record<string, ProviderSettingsUpdate>>({});
	const connectProvider = useCallback(
		(id: string) => {
			// Persist an (empty) settings entry so the provider is enabled with
			// whatever credentials it resolves at runtime (env vars, local CLI,
			// keyless endpoints).
			catalogGenerationRef.current++;
			void persistProviderSettings(id, { ...providerDraftsRef.current[id], enabled: true });
		},
		[persistProviderSettings, setProvidersWithCache],
	);

	const disconnectProvider = useCallback(
		async (id: string) => {
			delete providerDraftsRef.current[id];
			catalogGenerationRef.current++;
			setProvidersWithCache((prev) =>
				prev.map((p) =>
					p.id === id
						? {
								...p,
								enabled: false,
								apiKey: undefined,
								oauthAccessTokenPresent: false,
							}
						: p,
				),
			);
			const saved = await persistProviderSettings(id, { enabled: false });
			if (saved) {
				// Disconnecting removes the persisted entry (and the sidecar drops
				// a voice-input selection pointing at it); reload so the view and
				// the chat microphone reflect the real on-disk state.
				providerCatalogCache = null;
				notifyVoiceInputSettingsChanged();
				await loadProviderCatalog();
			}
		},
		[loadProviderCatalog, persistProviderSettings, setProvidersWithCache],
	);

	const updateProvider = useCallback(
		(id: string, updates: ProviderSettingsUpdate) => {
			const previous = providerDraftsRef.current[id];
			providerDraftsRef.current[id] = {
				...previous, ...updates,
				configValues: { ...previous?.configValues, ...updates.configValues },
			};
			// Draft credentials must never affect persisted connection readiness.
		},
		[],
	);

	const loadProviderModels = useCallback(
		async (id: string, options?: { fresh?: boolean }) => {
			setModelsLoadingByProvider((prev) => ({ ...prev, [id]: true }));
			setModelsErrorByProvider((prev) => ({ ...prev, [id]: null }));
			try {
				const payload = await desktopClient.invoke<ProviderModelsResponse>(
					"list_provider_models",
					{
						provider: id,
						fresh: options?.fresh === true,
					},
				);
				setProvidersWithCache((prev) =>
					prev.map((provider) =>
						provider.id === id
							? {
									...provider,
									modelList: payload.models,
									models: payload.models.length,
								}
							: provider,
					),
				);
				publishProviderModels(id, payload.models);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setModelsErrorByProvider((prev) => ({ ...prev, [id]: message }));
			} finally {
				setModelsLoadingByProvider((prev) => ({ ...prev, [id]: false }));
			}
		},
		[setProvidersWithCache],
	);

	const updateProviderModels = useCallback(
		async (id: string, models: string[]) => {
			setModelsLoadingByProvider((prev) => ({ ...prev, [id]: true }));
			setModelsErrorByProvider((prev) => ({ ...prev, [id]: null }));
			try {
				await desktopClient.invoke("update_provider_models", {
					provider: id,
					models,
				});
				await loadProviderModels(id);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setModelsErrorByProvider((prev) => ({ ...prev, [id]: message }));
			} finally {
				setModelsLoadingByProvider((prev) => ({ ...prev, [id]: false }));
			}
		},
		[loadProviderModels],
	);

	const effectiveSelectedProviderId = selectedProviderId;
	const selectedProvider = effectiveSelectedProviderId
		? (providers.find((p) => p.id === effectiveSelectedProviderId) ?? null)
		: null;

	const usesOAuth = (provider: Provider) =>
		getProviderAuthKind(provider) === "oauth";

	const runOAuthProviderLogin = async (id: string) => {
		const attempt = ++oauthAttemptRef.current;
		setOauthSigningProviderId(id);
		setOauthErrors((prev) => ({ ...prev, [id]: null }));
		try {
			const result = await desktopClient.invoke<{
				provider: string;
				accessToken: string;
			}>("run_provider_oauth_login", {
				provider: id,
			});
			if (attempt !== oauthAttemptRef.current) return;
			++catalogGenerationRef.current;
			setProvidersWithCache((prev) =>
				prev.map((provider) =>
					provider.id === id
						? {
								...provider,
								enabled: true,
								oauthAccessTokenPresent: result.accessToken.trim().length > 0,
							}
						: provider,
				),
			);
			// The shared catalog cache (composer selector, welcome setup notice)
			// must learn about the new OAuth connection too, not just this
			// view's local provider state.
			invalidateProviderCatalogCache();
			// Fetch the authoritative post-login snapshot. The resync claims a
			// new generation, so an older load or resync still in flight can't
			// arrive late and overwrite the just-connected state, and its own
			// response also covers any provider saved moments earlier.
			void resyncProviderCatalog();
			setSelectedProviderId(id);
		} catch (error) {
			if (attempt !== oauthAttemptRef.current) return;
			const message = error instanceof Error ? error.message : String(error);
			setOauthErrors((prev) => ({ ...prev, [id]: message }));
			await resyncProviderCatalog();
		} finally {
			if (attempt === oauthAttemptRef.current) setOauthSigningProviderId(null);
		}
	};

	const openProviderDetail = (id: string) => {
		onNavigateSection("Models");
		setSelectedProviderId(id);
	};

	useEffect(() => {
		if (!effectiveSelectedProviderId) {
			return;
		}
		const timeoutId = window.setTimeout(() => {
			// A local backend can change behind the same URL while this page is
			// closed. Use Core's source refresh, just like the refresh button,
			// so persisted models are replaced rather than merged with discovery.
			void loadProviderModels(effectiveSelectedProviderId, { fresh: true });
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, [loadProviderModels, effectiveSelectedProviderId]);

	const backToProviderList = () => {
		onNavigateSection("Models");
		setSelectedProviderId(null);
		setAddingProvider(false);
	};

	const saveNewProvider = useCallback(
		async (payload: AddProviderPayload) => {
			await desktopClient.invoke("add_provider", {
				provider_id: payload.providerId,
				name: payload.name,
				base_url: payload.baseUrl,
				api_key: payload.apiKey,
				headers: payload.headers,
				timeout_ms: payload.timeoutMs,
				models: payload.models,
				default_model_id: payload.defaultModelId,
				models_source_url: payload.modelsSourceUrl,
				capabilities: payload.capabilities,
			});
			invalidateProviderCatalogCache();
			await loadProviderCatalog();
			setAddingProvider(false);
			setSelectedProviderId(payload.providerId);
		},
		[loadProviderCatalog],
	);

	const openAddProvider = () => {
		onNavigateSection("Models");
		setAddingProvider(true);
	};

	const addProviderDialog = (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					setAddingProvider(false);
				}
			}}
			open={addingProvider}
		>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>添加供应商</DialogTitle>
					<DialogDescription>
						添加兼容 OpenAI 的供应商，并选择可用模型。
					</DialogDescription>
				</DialogHeader>
				<AddProviderContent
					existingProviderIds={providers.map((provider) => provider.id)}
					onBack={() => setAddingProvider(false)}
					onSave={saveNewProvider}
					variant="dialog"
				/>
			</DialogContent>
		</Dialog>
	);

	const providerContent = providersLoading ? (
		<div className="flex h-full items-center justify-center">
			<p className="text-sm text-muted-foreground">正在加载供应商…</p>
		</div>
	) : providerCatalogError ? (
		<div className="flex h-full items-center justify-center">
			<p className="max-w-xl px-4 text-center text-sm text-destructive">
				加载供应商失败：{providerCatalogError}
			</p>
		</div>
	) : selectedProvider ? (
		<ProviderDetailContent
			key={`${selectedProvider.id}:${detailResetToken}`}
			modelsError={modelsErrorByProvider[selectedProvider.id] ?? null}
			modelsLoading={modelsLoadingByProvider[selectedProvider.id] ?? false}
			oauthLoginPending={oauthSigningProviderId === selectedProvider.id}
			oauthLoginError={oauthErrors[selectedProvider.id]}
			onRefreshAuth={() => void resyncProviderCatalog()}
			onBack={backToProviderList}
			onConnect={() => connectProvider(selectedProvider.id)}
			onDisconnect={() => void disconnectProvider(selectedProvider.id)}
			onLoadModels={() =>
				void loadProviderModels(selectedProvider.id, { fresh: true })
			}
			onUpdateModels={(models) =>
				void updateProviderModels(selectedProvider.id, models)
			}
			onOAuthLogin={
				usesOAuth(selectedProvider)
					? () => void runOAuthProviderLogin(selectedProvider.id)
					: undefined
			}
			onUpdate={(updates) => updateProvider(selectedProvider.id, updates)}
			provider={selectedProvider}
		/>
	) : (
		<ProviderListContent
			onAddProvider={openAddProvider}
			onConfigure={openProviderDetail}
			providers={providers}
		/>
	);

	const content =
		activeNav === "Models" ? (
			<>
				{providerContent}
				{addProviderDialog}
			</>
		) : activeNav === "Voice" ? (
			<VoiceInputContent
				onOpenModelProviders={() => onNavigateSection("Models")}
			/>
		) : activeNav === "Customize" ? (
			<CustomizeView />
		) : activeNav === "Marketplace" ? (
			<MarketplaceExplorerView />
		) : activeNav === "Channels" ? (
			<ChannelsContent />
		) : activeNav === "Schedules" ? (
			<RoutineSchedulesContent onOpenSession={onOpenSession} />
		) : activeNav === "Account" ||
			activeNav === "AccountUsage" ||
			activeNav === "AccountBilling" ? (
			<AccountView
				activeTab={
					activeNav === "AccountUsage"
						? "usage"
						: activeNav === "AccountBilling"
							? "billing"
							: "overview"
				}
				onTabChange={(tab) =>
					onNavigateSection(
						tab === "usage"
							? "AccountUsage"
							: tab === "billing"
								? "AccountBilling"
								: "Account",
					)
				}
			/>
		) : activeNav === "General" ? (
			<GeneralSettingsContent
				onOpenModelProviders={() => onNavigateSection("Models")}
			/>
		) : (
			<div className="flex h-full items-center justify-center">
				<p className="text-sm text-muted-foreground">
					{activeNav} settings coming soon.
				</p>
			</div>
		);

	return (
		<div className="h-full overflow-hidden bg-background">
			<div className="h-full min-h-0 overflow-hidden">{content}</div>
		</div>
	);
}

/**
 * Swatches shown in the accent picker. The swatch color is the accent's
 * light-mode primary (see the [data-cline-accent] blocks in globals.css);
 * violet reads the live brand token so it always matches the default theme.
 */
const ACCENT_OPTIONS: { id: HubAccent; label: string; swatch: string }[] = [
	{ id: "violet", label: "紫罗兰", swatch: "var(--brand-violet)" },
	{ id: "graphite", label: "石墨", swatch: "oklch(0.27 0.012 248)" },
	{ id: "cyan", label: "青色", swatch: "oklch(0.6 0.12 222)" },
	{ id: "pink", label: "粉色", swatch: "oklch(0.75 0.1 354)" },
	{ id: "espresso", label: "咖啡色", swatch: "oklch(0.36 0.035 35)" },
	{ id: "ember", label: "余烬红", swatch: "oklch(0.6 0.19 33)" },
];

function GeneralSettingsContent({
	onOpenModelProviders,
}: {
	onOpenModelProviders: () => void;
}) {
	const [theme, setTheme] = useState<HubTheme>(() => {
		if (typeof window === "undefined") return "light";
		return readStoredHubTheme() ?? readSystemHubTheme();
	});
	const [followSystemTheme, setFollowSystemTheme] = useState(
		() => readStoredHubTheme() === null,
	);
	useEffect(() => watchSystemHubTheme(setTheme), []);
	const [importDialogOpen, setImportDialogOpen] = useState(false);
	const [accent, setAccent] = useState<HubAccent>(() => {
		if (typeof window === "undefined") return "violet";
		return readStoredHubAccent();
	});
	const [fontSize, setFontSize] = useState(() => {
		if (typeof window === "undefined") return DEFAULT_APP_FONT_SIZE;
		return readStoredAppFontSize();
	});
	const [telemetryOptOut, setTelemetryOptOut] = useState(false);
	const [preferredLanguage, setPreferredLanguage] = useState(
		readPreferredLanguage,
	);
	const [languageError, setLanguageError] = useState<string | null>(null);
	const [telemetryLoading, setTelemetryLoading] = useState(true);
	const [telemetrySaving, setTelemetrySaving] = useState(false);
	const [telemetryError, setTelemetryError] = useState<string | null>(null);
	const [webSearchEnabled, setWebSearchEnabled] = useState(false);
	const [webSearchLoading, setWebSearchLoading] = useState(true);
	const [webSearchSaving, setWebSearchSaving] = useState(false);
	const [webSearchError, setWebSearchError] = useState<string | null>(null);
	// Connected providers that offer native web search; null until the
	// catalog loads. The toggle silently does nothing with other providers,
	// so the row spells out whether it will actually take effect.
	const [webSearchReadyProviders, setWebSearchReadyProviders] = useState<
		string[] | null
	>(null);
	const [appVersion, setAppVersion] = useState<string | null>(null);

	useEffect(() => subscribeToAppFontSize(setFontSize), []);

	useEffect(() => {
		let cancelled = false;
		const loadWebSearchSupport = () => {
			void fetchProviderCatalog()
				.then((payload) => {
					if (cancelled) return;
					setWebSearchReadyProviders(
						(payload.providers ?? [])
							.filter(
								(provider) =>
									provider.enabled &&
									providerOffersModelTool(provider.id, "web_search"),
							)
							.map((provider) => provider.name),
					);
				})
				.catch(() => {
					// Support status is best-effort; the toggle works without it.
				});
		};
		loadWebSearchSupport();
		// Provider saves invalidate the catalog cache when they complete, so
		// refetching on invalidation keeps the status current even when the
		// user navigates here while a save is still in flight.
		const unsubscribe =
			subscribeToProviderCatalogInvalidation(loadWebSearchSupport);
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		void desktopClient
			.invoke<{ appVersion?: unknown }>("get_process_context")
			.then((context) => {
				if (cancelled) {
					return;
				}
				const version =
					typeof context?.appVersion === "string"
						? context.appVersion.trim()
						: "";
				setAppVersion(version || null);
			})
			.catch(() => {
				// Leave the About row versionless if the sidecar is unreachable.
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const loadGlobalSettings = useCallback(async () => {
		setTelemetryLoading(true);
		setTelemetryError(null);
		setWebSearchLoading(true);
		setWebSearchError(null);
		try {
			const settings = await desktopClient.invoke<GlobalSettingsResponse>(
				"get_global_settings",
			);
			setTelemetryOptOut(settings.telemetryOptOut);
			setWebSearchEnabled(settings.tools?.web_search?.enabled === true);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setTelemetryError(message);
			setWebSearchError(message);
		} finally {
			setTelemetryLoading(false);
			setWebSearchLoading(false);
		}
	}, []);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			void loadGlobalSettings();
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, [loadGlobalSettings]);

	const updateTelemetryOptOut = async (nextValue: boolean) => {
		const previousValue = telemetryOptOut;
		setTelemetryOptOut(nextValue);
		setTelemetrySaving(true);
		setTelemetryError(null);
		try {
			const settings = await desktopClient.invoke<GlobalSettingsResponse>(
				"set_telemetry_opt_out",
				{ telemetry_opt_out: nextValue },
			);
			setTelemetryOptOut(settings.telemetryOptOut);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setTelemetryOptOut(previousValue);
			setTelemetryError(message);
		} finally {
			setTelemetrySaving(false);
		}
	};

	const updateWebSearchEnabled = async (nextValue: boolean) => {
		const previousValue = webSearchEnabled;
		setWebSearchEnabled(nextValue);
		setWebSearchSaving(true);
		setWebSearchError(null);
		try {
			const settings = await desktopClient.invoke<GlobalSettingsResponse>(
				"set_web_search_enabled",
				{ web_search_enabled: nextValue },
			);
			setWebSearchEnabled(settings.tools?.web_search?.enabled === true);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setWebSearchEnabled(previousValue);
			setWebSearchError(message);
		} finally {
			setWebSearchSaving(false);
		}
	};

	const updateTheme = (darkModeEnabled: boolean) => {
		if (followSystemTheme) return;
		const nextTheme = darkModeEnabled ? "dark" : "light";
		setTheme(setStoredHubTheme(nextTheme));
	};

	const updateAccent = (nextAccent: HubAccent) => {
		setAccent(setStoredHubAccent(nextAccent));
	};

	const updateFontSizePreference = (nextFontSize: number) => {
		if (isAppFontSize(nextFontSize)) {
			setFontSize(setStoredAppFontSize(nextFontSize));
		}
	};

	const updateFontSize = ([nextFontSize]: number[]) => {
		updateFontSizePreference(nextFontSize);
	};

	// resetOnboarding dispatches ONBOARDING_RESET_EVENT, which the app shell
	// listens for to re-enter the first-run flow immediately.
	const replayOnboarding = () => {
		resetOnboarding();
	};

	return (
		<PageFrame>
			<PageHeader
				description="管理牛马桌面端及 CLI 环境的偏好设置。"
				title="通用设置"
			/>
			<section className="w-full min-w-0">
				<NotificationSettings />
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">
							跟随系统主题
						</p>
						<p className="text-sm text-muted-foreground">
							根据系统自动切换深色或浅色。关闭后可手动选择。
						</p>
					</div>
					<Switch
						aria-label="跟随系统主题"
						checked={followSystemTheme}
						onCheckedChange={(enabled) => {
							setTheme(setStoredHubTheme(enabled ? "system" : theme));
							setFollowSystemTheme(enabled);
						}}
					/>
				</div>
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">深色模式</p>
						<p className="text-sm text-muted-foreground">
							让桌面界面保持深色显示。
						</p>
					</div>
					<Switch
						aria-label="深色模式"
						disabled={followSystemTheme}
						className={followSystemTheme ? "grayscale" : undefined}
						checked={theme === "dark"}
						onCheckedChange={updateTheme}
					/>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-5 border-b py-4">
					<div className="flex flex-col gap-1">
						<label
							htmlFor="preferred-language"
							className="text-base font-semibold text-foreground"
						>
							偏好语言
						</label>
						<p className="text-sm text-muted-foreground">
							牛马与你交流时使用的语言，不改变界面语言。下一次发送生效。
						</p>
						{languageError && (
							<p role="alert" className="text-sm text-destructive">
								保存语言偏好失败：{languageError}
							</p>
						)}
					</div>
					<select
						id="preferred-language"
						className="rounded-md border bg-background px-3 py-2 text-sm"
						value={preferredLanguage}
						onChange={(event) => {
							const next = normalizePreferredLanguage(event.target.value);
							try {
								savePreferredLanguage(next);
								setPreferredLanguage(next);
								setLanguageError(null);
							} catch (error) {
								setLanguageError(String(error));
							}
						}}
					>
						{LANGUAGE_OPTIONS.map(([key, label]) => (
							<option key={key} value={key}>
								{label}
							</option>
						))}
					</select>
				</div>
				<div className="flex items-center justify-between gap-5 border-b py-4 max-[720px]:flex-col max-[720px]:items-stretch">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">字体大小</p>
						<p className="text-sm text-muted-foreground">
							调整应用内文字和界面元素的大小。
						</p>
					</div>
					<div className="flex w-64 shrink-0 items-center gap-3 max-[720px]:w-full">
						<Button
							aria-label="减小字体"
							className="size-7"
							disabled={fontSize === MIN_APP_FONT_SIZE}
							onClick={() => updateFontSizePreference(fontSize - 1)}
							size="icon"
							type="button"
							variant="outline"
						>
							<Minus />
						</Button>
						<Slider
							aria-label="字体大小"
							aria-valuetext={`${fontSize} 像素`}
							max={MAX_APP_FONT_SIZE}
							min={MIN_APP_FONT_SIZE}
							onValueChange={updateFontSize}
							step={1}
							value={[fontSize]}
						/>
						<Button
							aria-label="增大字体"
							className="size-7"
							disabled={fontSize === MAX_APP_FONT_SIZE}
							onClick={() => updateFontSizePreference(fontSize + 1)}
							size="icon"
							type="button"
							variant="outline"
						>
							<Plus />
						</Button>
						<output
							aria-label="当前字体大小"
							className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-foreground"
						>
							{fontSize}px
						</output>
					</div>
				</div>
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">强调色</p>
						<p className="text-sm text-muted-foreground">
							设置应用中按钮、链接和高亮内容的颜色。
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{ACCENT_OPTIONS.map((option) => (
							<button
								aria-label={option.label}
								aria-pressed={accent === option.id}
								className={cn(
									"size-7 rounded-full border border-foreground/10 transition-transform hover:scale-110",
									accent === option.id &&
										"ring-2 ring-ring ring-offset-2 ring-offset-background",
								)}
								key={option.id}
								onClick={() => updateAccent(option.id)}
								style={{ backgroundColor: option.swatch }}
								title={option.label}
								type="button"
							/>
						))}
					</div>
				</div>
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">
							供应商内置网页搜索
						</p>
						<p className="text-sm text-muted-foreground">
							允许支持此功能的模型使用供应商提供的内置搜索来查找网页。仅对新会话生效，不支持的供应商或模型不受影响。
						</p>
						<p className="text-sm text-muted-foreground">
							此开关不控制网页读取工具，也不设置自动批准。会话中的“自动允许 →
							获取网页内容”只决定读取网页时是否需要你的确认。
						</p>
						{webSearchReadyProviders ===
						null ? null : webSearchReadyProviders.length > 0 ? (
							<p className="text-xs text-muted-foreground">
								已连接且提供内置搜索的供应商：
								{webSearchReadyProviders.join("、")}。实际可用性取决于所选模型。
							</p>
						) : (
							<p className="text-xs text-amber-700 dark:text-amber-300">
								当前没有已连接且提供内置搜索的供应商，此设置暂不生效。{" "}
								<button
									className="underline underline-offset-2 hover:text-foreground"
									onClick={onOpenModelProviders}
									type="button"
								>
									连接供应商
								</button>
							</p>
						)}
						{webSearchError ? (
							<p className="mt-2 text-xs text-destructive" role="alert">
								更新供应商内置网页搜索设置失败：{webSearchError}
							</p>
						) : null}
					</div>
					<Switch
						aria-label="供应商内置网页搜索"
						checked={webSearchEnabled}
						disabled={webSearchLoading || webSearchSaving}
						onCheckedChange={(checked) => void updateWebSearchEnabled(checked)}
					/>
				</div>
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">遥测</p>
						<p className="text-sm text-muted-foreground">
							发送错误与使用情况报告，帮助改进 Cline。
						</p>
						{telemetryError ? (
							<p className="mt-2 text-xs text-destructive" role="alert">
								更新遥测设置失败：{telemetryError}
							</p>
						) : null}
					</div>
					<Switch
						aria-label="遥测"
						checked={!telemetryOptOut}
						disabled={telemetryLoading || telemetrySaving}
						onCheckedChange={(checked) => void updateTelemetryOptOut(!checked)}
					/>
				</div>
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">导入会话</p>
						<p className="text-sm text-muted-foreground">
							将 Claude Code、Codex 或 OpenCode 中的会话历史导入牛马。
						</p>
					</div>
					<Button
						className="shrink-0"
						onClick={() => setImportDialogOpen(true)}
						size="sm"
						type="button"
						variant="outline"
					>
						<Import className="size-3" />
						导入
					</Button>
				</div>
				<ImportSessionsDialog
					onOpenChange={setImportDialogOpen}
					open={importDialogOpen}
				/>
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">新手引导</p>
						<p className="text-sm text-muted-foreground">
							重新查看首次打开牛马时显示的新手引导。
						</p>
					</div>
					<Button
						className="shrink-0"
						onClick={replayOnboarding}
						size="sm"
						type="button"
						variant="outline"
					>
						<RotateCcw className="size-3" />
						重新播放
					</Button>
				</div>
				<ProxySettings />
				<div className="flex py-4 items-center justify-between gap-5 max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">关于</p>
						<p className="text-sm text-muted-foreground">
							{productNameForVersion(appVersion)}
							{appVersion ? ` v${appVersion}` : ""}
							{isBetaVersion(appVersion)
								? " — 测试版会与稳定版并行安装，并从测试版通道更新。"
								: ""}
						</p>
					</div>
					{isBetaVersion(appVersion) ? (
						<Badge
							className="shrink-0 uppercase tracking-wide"
							variant="secondary"
						>
							测试版
						</Badge>
					) : null}
				</div>
				<FullQuitSettings />
			</section>
		</PageFrame>
	);
}
