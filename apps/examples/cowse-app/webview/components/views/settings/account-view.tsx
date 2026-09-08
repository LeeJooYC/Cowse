"use client";

import type {
	ClineAccountBalance,
	ClineAccountOrganization,
	ClineAccountOrganizationBalance,
	ClineAccountOrganizationUsageTransaction,
	ClineAccountPaymentTransaction,
	ClineAccountUsageTransaction,
	ClineAccountUser,
} from "@cline/core";
import {
	AlertCircle,
	Building,
	CreditCard,
	ExternalLink,
	Loader2,
	LogIn,
	LogOut,
	Plus,
	Receipt,
	RefreshCw,
	User,
	UserCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/contexts/account-context";
import { useOAuthUserCode } from "@/hooks/use-oauth-user-code";
import { isClineAccountNotAuthenticatedResult } from "@/lib/cline-account-state";
import { desktopClient, openExternalUrl } from "@/lib/desktop-client";
import { invalidateProviderCatalogCache } from "@/lib/provider-model-catalog";
import { cn } from "@/lib/utils";
import { PageFrame, PageHeader } from "../page-layout";

const DASHBOARD_URL = "https://app.cline.bot/dashboard";
const USAGE_DASHBOARD_URL = "https://app.cline.bot/dashboard/usage";
const USER_CREDITS_URL =
	"https://app.cline.bot/dashboard/account?tab=credits&redirect=true";
const ORGANIZATION_CREDITS_URL =
	"https://app.cline.bot/dashboard/organization?tab=credits&redirect=true";
const CREATE_ORGANIZATION_URL = "https://app.cline.bot/onboarding?step=1";
const CREATE_ACCOUNT_URL = "https://app.cline.bot";

function normalizeAccountViewError(error: unknown): Error {
	const message = error instanceof Error ? error.message : String(error);
	if (message.includes("unsupported desktop command: cline_account")) {
		return new Error(
			"桌面辅助进程版本过旧，不支持账户操作。请重新启动辅助进程或重新加载应用后再试。",
		);
	}
	return error instanceof Error ? error : new Error(message);
}

function isAccountAuthError(message: string): boolean {
	// Only definitive signed-out signals belong here: matching broader
	// substrings like "auth token" or "unauthorized" turns transient refresh
	// failures and org-permission errors into a sign-in card with no retry.
	const normalized = message.toLowerCase();
	return (
		normalized.includes("no cline account auth token found") ||
		normalized.includes("requires re-authentication") ||
		normalized.includes("failed with status 401")
	);
}

// ---------------------------------------------------------------------------
// Data fetching helpers via sidecar command
// ---------------------------------------------------------------------------

async function fetchAccountUser(): Promise<ClineAccountUser> {
	return await desktopClient.invoke<ClineAccountUser>("cline_account", {
		action: "clineAccount",
		operation: "fetchMe",
	});
}

async function fetchAccountBalance(): Promise<ClineAccountBalance> {
	return await desktopClient.invoke<ClineAccountBalance>("cline_account", {
		action: "clineAccount",
		operation: "fetchBalance",
	});
}

async function fetchAccountOrganizations(): Promise<
	ClineAccountOrganization[]
> {
	return await desktopClient.invoke<ClineAccountOrganization[]>(
		"cline_account",
		{
			action: "clineAccount",
			operation: "fetchUserOrganizations",
		},
	);
}

async function fetchOrganizationBalance(
	organizationId: string,
): Promise<ClineAccountOrganizationBalance> {
	return await desktopClient.invoke<ClineAccountOrganizationBalance>(
		"cline_account",
		{
			action: "clineAccount",
			operation: "fetchOrganizationBalance",
			organizationId,
		},
	);
}

async function fetchUsageTransactions(): Promise<
	ClineAccountUsageTransaction[]
> {
	return await desktopClient.invoke<ClineAccountUsageTransaction[]>(
		"cline_account",
		{
			action: "clineAccount",
			operation: "fetchUsageTransactions",
		},
	);
}

async function fetchOrganizationUsageTransactions(
	organizationId: string,
	memberId?: string,
): Promise<ClineAccountOrganizationUsageTransaction[]> {
	return await desktopClient.invoke<ClineAccountOrganizationUsageTransaction[]>(
		"cline_account",
		{
			action: "clineAccount",
			operation: "fetchOrganizationUsageTransactions",
			organizationId,
			...(memberId?.trim() ? { memberId: memberId.trim() } : {}),
		},
	);
}

async function fetchPaymentTransactions(): Promise<
	ClineAccountPaymentTransaction[]
> {
	return await desktopClient.invoke<ClineAccountPaymentTransaction[]>(
		"cline_account",
		{
			action: "clineAccount",
			operation: "fetchPaymentTransactions",
		},
	);
}

async function switchActiveAccount(
	organizationId: string | null,
): Promise<void> {
	await desktopClient.invoke("cline_account", {
		action: "clineAccount",
		operation: "switchAccount",
		organizationId,
	});
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ignoreTabChange = () => {};

export function AccountView({
	activeTab = "overview",
	onTabChange: setActiveTab = ignoreTabChange,
}: {
	activeTab?: "overview" | "usage" | "billing";
	onTabChange?: (tab: "overview" | "usage" | "billing") => void;
}) {
	const { refreshAccount } = useAccount();

	// Overview data
	const [user, setUser] = useState<ClineAccountUser | null>(null);
	const [balance, setBalance] = useState<ClineAccountBalance | null>(null);
	const [organizationBalance, setOrganizationBalance] =
		useState<ClineAccountOrganizationBalance | null>(null);
	const [organizations, setOrganizations] = useState<
		ClineAccountOrganization[]
	>([]);
	const [overviewLoading, setOverviewLoading] = useState(true);
	const [overviewError, setOverviewError] = useState<string | null>(null);
	// Signed out is an expected state carried by a typed sidecar result (or a
	// definitive auth error from older sidecars), tracked separately from
	// failures so it renders the sign-in prompt instead of an error card.
	const [signedOut, setSignedOut] = useState(false);
	const [accountActionPending, setAccountActionPending] = useState<
		"sign-in" | "sign-out" | null
	>(null);
	const deviceUserCode = useOAuthUserCode(accountActionPending === "sign-in");
	// Organization id being switched to, "" while switching to the personal
	// account, null when no switch is in flight.
	const [switchTargetId, setSwitchTargetId] = useState<string | null>(null);

	// Usage data
	const [usageTransactions, setUsageTransactions] = useState<
		ClineAccountUsageTransaction[]
	>([]);
	const [usageLoading, setUsageLoading] = useState(false);
	const [usageError, setUsageError] = useState<string | null>(null);
	const [usageLoaded, setUsageLoaded] = useState(false);
	const usageGenerationRef = useRef(0);

	// Billing data
	const [paymentTransactions, setPaymentTransactions] = useState<
		ClineAccountPaymentTransaction[]
	>([]);
	const [billingLoading, setBillingLoading] = useState(false);
	const [billingError, setBillingError] = useState<string | null>(null);
	const [billingLoaded, setBillingLoaded] = useState(false);
	const activeOrganization = organizations.find((org) => org.active) ?? null;

	const resetAccountData = useCallback(() => {
		setUser(null);
		setBalance(null);
		setOrganizationBalance(null);
		setOrganizations([]);
		setUsageTransactions([]);
		setUsageLoaded(false);
		setUsageError(null);
		setPaymentTransactions([]);
		setBillingLoaded(false);
		setBillingError(null);
	}, []);

	// -- Overview fetch --
	const loadOverview = useCallback(async () => {
		setOverviewLoading(true);
		setOverviewError(null);
		try {
			// Resolve the auth state first: when the session is signed out the
			// remaining account commands would just fail the same way, so they
			// are never fired.
			const userData = await fetchAccountUser();
			if (isClineAccountNotAuthenticatedResult(userData)) {
				resetAccountData();
				setSignedOut(true);
				return;
			}
			const [balanceData, orgsData] = await Promise.all([
				fetchAccountBalance(),
				fetchAccountOrganizations(),
			]);
			if (
				isClineAccountNotAuthenticatedResult(balanceData) ||
				isClineAccountNotAuthenticatedResult(orgsData)
			) {
				resetAccountData();
				setSignedOut(true);
				return;
			}
			const nextActiveOrganization =
				orgsData.find((organization) => organization.active) ?? null;
			const organizationBalanceData = nextActiveOrganization
				? await fetchOrganizationBalance(nextActiveOrganization.organizationId)
				: null;
			if (isClineAccountNotAuthenticatedResult(organizationBalanceData)) {
				resetAccountData();
				setSignedOut(true);
				return;
			}
			setSignedOut(false);
			setUser(userData);
			setBalance(balanceData);
			setOrganizationBalance(organizationBalanceData);
			setOrganizations(orgsData);
		} catch (err) {
			resetAccountData();
			const message = normalizeAccountViewError(err).message;
			if (isAccountAuthError(message)) {
				setSignedOut(true);
			} else {
				setOverviewError(message);
			}
		} finally {
			setOverviewLoading(false);
		}
	}, [resetAccountData]);

	useEffect(() => {
		void loadOverview();
	}, [loadOverview]);

	const signIn = async () => {
		setAccountActionPending("sign-in");
		setOverviewError(null);
		try {
			await desktopClient.invoke("run_provider_oauth_login", {
				provider: "cline",
			});
			await loadOverview();
			setActiveTab("overview");
		} catch (err) {
			const message = normalizeAccountViewError(err).message;
			setOverviewError(message);
			resetAccountData();
		} finally {
			// The login may have persisted credentials; drop the short-lived
			// catalog cache so consumers reload them.
			invalidateProviderCatalogCache();
			setAccountActionPending(null);
			void refreshAccount();
		}
	};

	const signOut = async () => {
		setAccountActionPending("sign-out");
		try {
			await desktopClient.invoke("save_provider_settings", {
				provider: "cline",
				api_key: "",
				settings: {
					auth: {
						accessToken: "",
						refreshToken: "",
						accountId: "",
					},
				},
			});
			resetAccountData();
			setActiveTab("overview");
			setOverviewError(null);
			setSignedOut(true);
		} catch (err) {
			const message = normalizeAccountViewError(err).message;
			setOverviewError(message);
		} finally {
			invalidateProviderCatalogCache();
			setAccountActionPending(null);
			void refreshAccount();
		}
	};

	const switchAccount = async (organizationId: string | null) => {
		if (switchTargetId !== null) {
			return;
		}
		setSwitchTargetId(organizationId ?? "");
		try {
			await switchActiveAccount(organizationId);
			await loadOverview();
		} catch (err) {
			const message = normalizeAccountViewError(err).message;
			setOverviewError(message);
		} finally {
			setSwitchTargetId(null);
			void refreshAccount();
		}
	};

	// -- Usage fetch (lazy on tab switch) --
	const loadUsage = useCallback(async () => {
		const generation = usageGenerationRef.current;
		setUsageLoading(true);
		setUsageError(null);
		try {
			const data = activeOrganization
				? await fetchOrganizationUsageTransactions(
						activeOrganization.organizationId,
						activeOrganization.memberId,
					)
				: await fetchUsageTransactions();
			if (usageGenerationRef.current !== generation) return;
			// The token can expire mid-session: render the sign-in state
			// instead of an error toast.
			if (isClineAccountNotAuthenticatedResult(data)) {
				resetAccountData();
				setSignedOut(true);
				setActiveTab("overview");
				return;
			}
			setUsageTransactions(data);
			setUsageLoaded(true);
		} catch (err) {
			if (usageGenerationRef.current !== generation) return;
			const message = normalizeAccountViewError(err).message;
			setUsageError(message);
		} finally {
			if (usageGenerationRef.current === generation) {
				setUsageLoading(false);
			}
		}
	}, [activeOrganization, resetAccountData, setActiveTab]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: we need to reset usage state when the organization changes
	useEffect(() => {
		usageGenerationRef.current += 1;
		setUsageTransactions([]);
		setUsageLoaded(false);
		setUsageError(null);
	}, [activeOrganization?.organizationId]);

	useEffect(() => {
		if (user && activeTab === "usage" && !usageLoaded) {
			void loadUsage();
		}
	}, [user, activeTab, usageLoaded, loadUsage]);

	// -- Billing fetch (lazy on tab switch) --
	const loadBilling = useCallback(async () => {
		setBillingLoading(true);
		setBillingError(null);
		try {
			const data = await fetchPaymentTransactions();
			if (isClineAccountNotAuthenticatedResult(data)) {
				resetAccountData();
				setSignedOut(true);
				setActiveTab("overview");
				return;
			}
			setPaymentTransactions(data);
			setBillingLoaded(true);
		} catch (err) {
			const message = normalizeAccountViewError(err).message;
			setBillingError(message);
		} finally {
			setBillingLoading(false);
		}
	}, [resetAccountData, setActiveTab]);

	useEffect(() => {
		if (user && activeTab === "billing" && !billingLoaded) {
			void loadBilling();
		}
	}, [user, activeTab, billingLoaded, loadBilling]);

	// -- Formatters --

	const formatDate = (dateStr: string) => {
		return new Date(dateStr).toLocaleDateString("zh-CN", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	const formatTime = (dateStr: string) => {
		return new Date(dateStr).toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
		});
	};

	const formatCreditBalance = (value: number, decimalPlaces = 2) => {
		return new Intl.NumberFormat("en-US", {
			minimumFractionDigits: decimalPlaces,
			maximumFractionDigits: decimalPlaces,
		}).format(value / 1_000_000);
	};

	const displayedBalance = activeOrganization
		? (organizationBalance?.balance ?? balance?.balance ?? null)
		: (balance?.balance ?? null);

	const tabLabels = {
		overview: "概览",
		usage: "用量",
		billing: "账单",
	} as const;

	// -- Shared error / loading UI --

	const renderError = (message: string, onRetry: () => void) => (
		<div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
			<AlertCircle className="h-8 w-8 text-destructive" />
			<p className="text-sm text-muted-foreground max-w-md">{message}</p>
			<button
				type="button"
				onClick={onRetry}
				className="flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
			>
				<RefreshCw className="h-4 w-4" />
				重试
			</button>
		</div>
	);

	const renderSignedOut = () => (
		<div className="rounded-lg border border-border p-6">
			<div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-8 text-center">
				<div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<UserCircleIcon className="h-6 w-6" />
				</div>
				<div>
					<h3 className="text-lg font-semibold text-foreground">
						登录 Cline 账户
					</h3>
					<p className="mt-2 text-sm text-muted-foreground">
						连接 Cline 账户以查看额度、用量、账单和组织详情。
					</p>
				</div>
				<div className="flex flex-wrap items-center justify-center gap-2">
					<button
						type="button"
						disabled={accountActionPending !== null}
						onClick={() => void signIn()}
						className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
					>
						{accountActionPending === "sign-in" ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<LogIn className="h-4 w-4" />
						)}
						{accountActionPending === "sign-in" ? "正在登录" : "登录"}
					</button>
					<button
						type="button"
						onClick={() => void openExternalUrl(CREATE_ACCOUNT_URL)}
						className="flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground "
					>
						创建账户
						<ExternalLink className="h-4 w-4" />
					</button>
				</div>
				{accountActionPending === "sign-in" && deviceUserCode ? (
					<p className="text-sm text-muted-foreground">
						请在浏览器中确认此代码：{" "}
						<span className="font-mono font-medium text-foreground">
							{deviceUserCode}
						</span>
					</p>
				) : null}
			</div>
		</div>
	);

	const renderLoading = () => (
		<div className="flex items-center justify-center py-12">
			<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
		</div>
	);

	const renderAccountRow = (input: {
		key: string;
		name: string;
		subtitle: string;
		icon: React.ReactNode;
		active: boolean;
		switching: boolean;
		onSelect: () => void;
	}) => (
		<button
			key={input.key}
			type="button"
			disabled={input.active || switchTargetId !== null}
			onClick={input.onSelect}
			className={cn(
				"flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors",
				input.active ? "cursor-default" : "hover:bg-surface-hover-lighter",
				!input.active && switchTargetId !== null && "opacity-60",
			)}
		>
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-foreground">
				{input.icon}
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium text-foreground">{input.name}</p>
				<p className="text-xs text-muted-foreground capitalize">
					{input.subtitle}
				</p>
			</div>
			{input.switching ? (
				<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
			) : input.active ? (
				<span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
					当前
				</span>
			) : (
				<span className="text-xs text-muted-foreground">切换</span>
			)}
		</button>
	);

	return (
		<PageFrame>
			<PageHeader
				title={tabLabels[activeTab]}
				actions={
					user && activeTab === "overview" ? (
						<button
							type="button"
							disabled={accountActionPending !== null}
							onClick={() => void signOut()}
							className="flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-60"
						>
							{accountActionPending === "sign-out" ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<LogOut className="size-4" />
							)}
							{accountActionPending === "sign-out" ? "正在退出" : "退出登录"}
						</button>
					) : undefined
				}
			/>

			{activeTab !== "overview" && overviewLoading && renderLoading()}
			{activeTab !== "overview" &&
				!overviewLoading &&
				signedOut &&
				renderSignedOut()}
			{activeTab !== "overview" &&
				overviewError &&
				renderError(overviewError, loadOverview)}

			{/* Overview Tab */}
			{activeTab === "overview" && (
				<div className="flex flex-col gap-6">
					{overviewLoading && renderLoading()}
					{!overviewLoading && signedOut && renderSignedOut()}
					{overviewError && renderError(overviewError, loadOverview)}
					{!overviewLoading && !signedOut && !overviewError && user && (
						<>
							{/* User Profile Card */}
							<div className="rounded-lg border border-border p-5">
								<div className="flex items-start gap-4">
									<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-(--accent-a3) text-2xl font-bold text-primary">
										{user.displayName?.charAt(0) ??
											user.email?.charAt(0) ??
											"?"}
									</div>
									<div className="min-w-0 flex-1">
										<h3 className="text-lg font-semibold text-foreground">
											{user.displayName || user.email}
										</h3>
										<p className="mt-0.5 text-sm text-muted-foreground">
											{user.email}
										</p>
										<p className="mt-2 text-xs text-muted-foreground">
											加入于 {formatDate(user.createdAt)}
										</p>
									</div>
									<button
										type="button"
										title="打开控制台"
										onClick={() => void openExternalUrl(DASHBOARD_URL)}
										className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
									>
										<ExternalLink className="h-4 w-4" />
									</button>
								</div>
							</div>

							{/* Balance Card */}
							{displayedBalance !== null && (
								<div className="rounded-lg border border-border p-5">
									<div className="flex items-center justify-between mb-4">
										<div className="flex items-center gap-3">
											<CreditCard className="h-5 w-5 text-primary" />
											<h3 className="text-sm font-semibold text-foreground">
												{activeOrganization
													? `${activeOrganization.name} 余额`
													: "额度余额"}
											</h3>
										</div>
										<button
											type="button"
											onClick={() =>
												void openExternalUrl(
													activeOrganization
														? ORGANIZATION_CREDITS_URL
														: USER_CREDITS_URL,
												)
											}
											className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
										>
											<Plus className="h-3.5 w-3.5" />
											充值
										</button>
									</div>
									<div className="flex items-baseline gap-2">
										<span className="text-3xl font-bold text-foreground">
											${formatCreditBalance(displayedBalance)}
										</span>
									</div>
									{activeOrganization && balance && (
										<p className="mt-2 text-xs text-muted-foreground">
											个人账户：{formatCreditBalance(balance.balance)} 额度
										</p>
									)}
								</div>
							)}

							{/* Organizations */}
							<div className="rounded-lg border border-border p-5">
								<div className="flex items-center justify-between mb-4">
									<div className="flex items-center gap-3">
										<Building className="h-5 w-5 text-muted-foreground" />
										<h3 className="text-sm font-semibold text-foreground">
											组织
										</h3>
									</div>
									<button
										type="button"
										onClick={() =>
											void openExternalUrl(CREATE_ORGANIZATION_URL)
										}
										className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground "
									>
										<Plus className="h-3.5 w-3.5" />
										创建
									</button>
								</div>
								<div className="flex flex-col gap-2">
									{renderAccountRow({
										key: "personal",
										name: "个人",
										subtitle: user.email ?? "个人账户",
										icon: <User className="h-4 w-4" />,
										active: !activeOrganization,
										switching: switchTargetId === "",
										onSelect: () => void switchAccount(null),
									})}
									{organizations.map((org) =>
										renderAccountRow({
											key: org.organizationId,
											name: org.name,
											subtitle: org.roles.join(", "),
											icon: org.name.charAt(0),
											active: org.active,
											switching: switchTargetId === org.organizationId,
											onSelect: () => void switchAccount(org.organizationId),
										}),
									)}
								</div>
							</div>
						</>
					)}
				</div>
			)}

			{/* Usage Tab */}
			{user && activeTab === "usage" && (
				<div>
					<p className="mb-6 text-sm text-muted-foreground">
						{activeOrganization
							? `${activeOrganization.name} 最近的 API 用量和 Token 消耗。`
							: "所有供应商最近的 API 用量和 Token 消耗。"}
					</p>
					{usageLoading && renderLoading()}
					{usageError && renderError(usageError, loadUsage)}
					{!usageLoading && !usageError && usageLoaded && (
						<div className="overflow-hidden rounded-lg border border-border">
							<div className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_5.5rem] gap-4 border-b border-border bg-secondary/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
								<span>模型</span>
								<span className="text-right">Token</span>
								<span className="text-right">额度</span>
								<span className="text-right">时间</span>
							</div>
							{usageTransactions.length === 0 ? (
								<p className="px-4 py-8 text-center text-sm text-muted-foreground">
									暂无用量记录。
								</p>
							) : (
								<div className="divide-y divide-border">
									{usageTransactions.map((tx) => (
										<div
											key={tx.id}
											className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_5.5rem] gap-4 px-4 py-3 text-sm hover:bg-surface-hover"
										>
											<div className="min-w-0">
												<p className="font-medium text-foreground truncate">
													{tx.aiModelName}
												</p>
												<p className="text-xs text-muted-foreground">
													{tx.aiInferenceProviderName}
												</p>
											</div>
											<div className="text-right text-muted-foreground">
												{tx.totalTokens.toLocaleString()}
											</div>
											<div className="text-right text-foreground font-medium">
												{formatCreditBalance(tx.creditsUsed)}
											</div>
											<div className="text-right text-xs text-muted-foreground">
												<p>{formatDate(tx.createdAt)}</p>
												<p>{formatTime(tx.createdAt)}</p>
											</div>
										</div>
									))}
								</div>
							)}
							<div className="flex justify-center border-t border-border px-4 py-3">
								<button
									type="button"
									onClick={() => void openExternalUrl(USAGE_DASHBOARD_URL)}
									className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
								>
									查看更多
									<ExternalLink className="h-3.5 w-3.5" />
								</button>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Billing Tab */}
			{user && activeTab === "billing" && (
				<div>
					<p className="mb-6 text-sm text-muted-foreground">
						付款历史和额度购买记录。
					</p>
					{billingLoading && renderLoading()}
					{billingError && renderError(billingError, loadBilling)}
					{!billingLoading &&
						!billingError &&
						billingLoaded &&
						(paymentTransactions.length === 0 ? (
							<p className="py-8 text-center text-sm text-muted-foreground">
								暂无付款记录。
							</p>
						) : (
							<div className="rounded-lg border border-border overflow-hidden">
								<div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border bg-secondary/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
									<span>日期</span>
									<span className="text-right">金额</span>
									<span className="text-right">额度</span>
								</div>
								<div className="divide-y divide-border">
									{paymentTransactions.map((tx) => (
										<div
											key={`${tx.paidAt}-${tx.amountCents}-${tx.credits}`}
											className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 text-sm hover:bg-surface-hover"
										>
											<div className="flex items-center gap-3">
												<Receipt className="h-4 w-4 text-muted-foreground" />
												<span className="text-foreground">
													{formatDate(tx.paidAt)}
												</span>
											</div>
											<div className="text-right text-foreground font-medium">
												${(tx.amountCents / 100).toFixed(2)}
											</div>
											<div className="text-right text-primary font-medium">
												+{formatCreditBalance(tx.credits)}
											</div>
										</div>
									))}
								</div>
							</div>
						))}
				</div>
			)}
		</PageFrame>
	);
}
