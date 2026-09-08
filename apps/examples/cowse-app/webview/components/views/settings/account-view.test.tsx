// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountView } from "./account-view";

const { invoke, openExternalUrl } = vi.hoisted(() => ({
	invoke: vi.fn(),
	openExternalUrl: vi.fn(),
}));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke },
	openExternalUrl,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	invoke.mockReset();
	openExternalUrl.mockReset();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
});

describe("AccountView usage table", () => {
	it("opens the full usage dashboard from the empty table footer", async () => {
		invoke.mockImplementation(
			async (_command: string, args?: Record<string, unknown>) => {
				switch (args?.operation) {
					case "fetchMe":
						return {
							id: "user-1",
							email: "beatrix@cline.bot",
							displayName: "Beatrix",
							createdAt: "2024-01-01T00:00:00Z",
							updatedAt: "2024-01-01T00:00:00Z",
							organizations: [],
						};
					case "fetchBalance":
						return { balance: 5_000_000 };
					case "fetchUserOrganizations":
						return [];
					case "fetchUsageTransactions":
					case "fetchPaymentTransactions":
						return [];
					default:
						return {};
				}
			},
		);

		await act(async () => {
			root.render(<AccountView />);
		});
		await vi.waitFor(() => {
			expect(container.textContent).toContain("Beatrix");
		});

		await act(async () => root.render(<AccountView activeTab="usage" />));
		expect(container.querySelector("h1")?.textContent).toBe("用量");
		expect(container.textContent).not.toContain("退出登录");
		expect(
			Array.from(container.querySelectorAll("button")).some((button) =>
				["概览", "用量", "账单"].includes(button.textContent ?? ""),
			),
		).toBe(false);

		await vi.waitFor(() => {
			expect(container.textContent).toContain("查看更多");
			expect(container.textContent).toContain("暂无用量记录。");
		});
		const seeMoreButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("查看更多"),
		);
		await act(async () => seeMoreButton?.click());

		expect(openExternalUrl).toHaveBeenCalledWith(
			"https://app.cline.bot/dashboard/usage",
		);
		await act(async () => root.render(<AccountView activeTab="billing" />));
		expect(container.querySelector("h1")?.textContent).toBe("账单");
		expect(container.textContent).not.toContain("退出登录");
		expect(invoke).toHaveBeenCalledWith("cline_account", {
			action: "clineAccount",
			operation: "fetchPaymentTransactions",
		});
		await act(async () => root.render(<AccountView activeTab="overview" />));
		expect(container.textContent).toContain("Beatrix");
		expect(container.querySelector("h1")?.textContent).toBe("概览");
		expect(container.textContent).toContain("退出登录");
	});
});

describe("AccountView signed-out state", () => {
	it("renders the sign-in prompt from the typed result and stops fetching account data", async () => {
		invoke.mockResolvedValue({
			signedIn: false,
			code: "ACCOUNT_NOT_AUTHENTICATED",
		});

		await act(async () => {
			root.render(<AccountView />);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toContain("登录 Cline 账户");
		});
		expect(container.textContent).not.toContain(
			"No Cline account auth token found",
		);
		// The auth state gates the rest of the overview: signed out means the
		// balance/organization commands are never fired.
		const accountCalls = invoke.mock.calls.filter(
			([command]) => command === "cline_account",
		);
		expect(accountCalls).toEqual([
			["cline_account", { action: "clineAccount", operation: "fetchMe" }],
		]);
	});

	it("signs out when the organization balance fetch reports the typed signed-out result", async () => {
		// The token can expire between the initial account fetches and the
		// organization-balance fetch; the typed result must sign the view out
		// rather than being coerced into a signed-in view with no balance.
		invoke.mockImplementation(
			async (_command: string, args?: Record<string, unknown>) => {
				switch (args?.operation) {
					case "fetchMe":
						return {
							id: "user-1",
							email: "beatrix@cline.bot",
							displayName: "Beatrix",
							createdAt: "2024-01-01T00:00:00Z",
							updatedAt: "2024-01-01T00:00:00Z",
							organizations: [],
						};
					case "fetchBalance":
						return { balance: 5_000_000 };
					case "fetchUserOrganizations":
						return [
							{
								organizationId: "org-1",
								name: "Cline",
								active: true,
								roles: ["member"],
							},
						];
					case "fetchOrganizationBalance":
						return { signedIn: false, code: "ACCOUNT_NOT_AUTHENTICATED" };
					default:
						return {};
				}
			},
		);

		await act(async () => {
			root.render(<AccountView />);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toContain("登录 Cline 账户");
		});
		expect(container.textContent).not.toContain("Beatrix");
	});

	it("renders account data when the session is signed in", async () => {
		invoke.mockImplementation(
			async (_command: string, args?: Record<string, unknown>) => {
				switch (args?.operation) {
					case "fetchMe":
						return {
							id: "user-1",
							email: "beatrix@cline.bot",
							displayName: "Beatrix",
							createdAt: "2024-01-01T00:00:00Z",
							updatedAt: "2024-01-01T00:00:00Z",
							organizations: [],
						};
					case "fetchBalance":
						return { balance: 5_000_000 };
					case "fetchUserOrganizations":
						return [];
					default:
						return {};
				}
			},
		);

		await act(async () => {
			root.render(<AccountView />);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toContain("Beatrix");
		});
		expect(container.textContent).not.toContain("登录 Cline 账户");
	});
});
