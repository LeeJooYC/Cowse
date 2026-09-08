// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AgentSidebar,
	getSessionOverviewItems,
	getSessionOverviewTitle,
} from "@/components/agent-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AccountProvider } from "@/contexts/account-context";
import type {
	SessionThread,
	UseSessionHistoryResult,
} from "@/hooks/use-session-history";

const desktopMocks = vi.hoisted(() => ({
	invoke: vi.fn(),
	subscribe: vi.fn(() => () => undefined),
	subscribeTransportState: vi.fn(() => () => undefined),
}));
const { invoke } = desktopMocks;
vi.mock("@/lib/desktop-client", () => ({ desktopClient: desktopMocks }));

let container: HTMLDivElement;
let root: Root;

function makeThread(project: string, index: number): SessionThread {
	return {
		id: `${project}-${index}`,
		title: `${project} session ${index}`,
		codebase: project,
		workspacePath: `/projects/${project}`,
		time: `${index}m`,
		provider: "cline",
		model: "test-model",
		status: "completed",
		isScheduled: false,
	};
}

function makeSessionHistory(
	threads: SessionThread[],
	loadMoreSessions: ReturnType<typeof vi.fn>,
	options: {
		loadOlderSessions?: ReturnType<typeof vi.fn>;
		mayHaveMoreSessions?: boolean;
		hasLoadedHistory?: boolean;
		isLoadingMore?: boolean;
	} = {},
): UseSessionHistoryResult {
	return {
		deleteThread: vi.fn(),
		forkThread: vi.fn(),
		hasLoadedHistory: options.hasLoadedHistory ?? true,
		isLoadingMore: options.isLoadingMore ?? false,
		loadAllSessions: vi.fn(async () => true),
		loadOlderSessions: options.loadOlderSessions ?? vi.fn(),
		loadMoreSessions,
		mayHaveMoreSessions: options.mayHaveMoreSessions ?? false,
		openThread: vi.fn(),
		pendingAction: null,
		renameThread: vi.fn(),
		threads,
		unreadSessionIds: new Set<string>(),
	} as unknown as UseSessionHistoryResult;
}

async function click(element: Element): Promise<void> {
	await act(async () => {
		element.dispatchEvent(
			new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
		);
		element.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		);
		await Promise.resolve();
	});
}

async function hover(element: Element): Promise<void> {
	await act(async () => {
		element.dispatchEvent(
			new MouseEvent("pointerover", { bubbles: true, cancelable: true }),
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

function buttonWithText(text: string, rootNode: ParentNode = container) {
	const button = [
		...rootNode.querySelectorAll<HTMLButtonElement>("button"),
	].find((candidate) => candidate.textContent?.includes(text));
	expect(button).toBeDefined();
	return button as HTMLButtonElement;
}

async function switchToProjectSort(): Promise<void> {
	// The sort control is a direct toggle: one click flips to project mode.
	await click(
		container.querySelector('[aria-label="Sort sessions: Time"]') as Element,
	);
	await vi.waitFor(() => {
		expect(
			container.querySelector('[aria-label="Sort sessions: Project"]'),
		).not.toBeNull();
	});
}

function sessionIsVisible(title: string): boolean {
	return [...container.querySelectorAll<HTMLButtonElement>("button")].some(
		(button) => button.querySelector("span")?.textContent === title,
	);
}

function sessionRow(title: string): HTMLButtonElement {
	const row = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(button) => button.querySelector("span")?.textContent === title,
	);
	expect(row).toBeDefined();
	return row as HTMLButtonElement;
}

const signedInUser = {
	id: "user-1",
	email: "beatrix@cline.bot",
	displayName: "Beatrix",
	photoUrl: "",
	createdAt: "2024-01-01T00:00:00Z",
	updatedAt: "2024-01-01T00:00:00Z",
	organizations: [
		{
			active: true,
			memberId: "member-1",
			name: "Cline Bot Inc",
			organizationId: "org-1",
			roles: ["admin"],
		},
	],
};

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	window.localStorage.clear();
	invoke.mockReset();
	invoke.mockRejectedValue(new Error("No Cline account auth token found"));
	desktopMocks.subscribe.mockReset();
	desktopMocks.subscribe.mockImplementation(() => () => undefined);
	desktopMocks.subscribeTransportState.mockReset();
	desktopMocks.subscribeTransportState.mockImplementation(
		() => () => undefined,
	);
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: vi.fn(() => ({
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	});
	HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
	HTMLElement.prototype.setPointerCapture = vi.fn();
	HTMLElement.prototype.releasePointerCapture = vi.fn();
	HTMLElement.prototype.scrollIntoView = vi.fn();
	// cmdk (the search dialog) observes its list size; jsdom has no
	// ResizeObserver implementation.
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
});

describe("AgentSidebar session organization", () => {
	it("marks scheduled sessions with a clock icon in the row", async () => {
		const scheduled = {
			...makeThread("alpha", 1),
			source: "core",
			isScheduled: true,
		};
		const pinnedScheduled = {
			...makeThread("alpha", 2),
			isScheduled: true,
			pinned: true,
		};
		const regular = { ...makeThread("alpha", 3), source: "core" };

		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={makeSessionHistory(
							[scheduled, pinnedScheduled, regular],
							vi.fn(),
						)}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});

		// The clock marks scheduled rows inline; a pinned scheduled session
		// shows both indicators at once.
		expect(
			sessionRow("alpha session 1").querySelector('[aria-label="Scheduled"]'),
		).not.toBeNull();
		// The clock leads the row: it renders before the title text.
		// The innermost matching span is the title itself (the outer flex
		// span also carries the title text plus the icon).
		const scheduledTitle = [
			...sessionRow("alpha session 1").querySelectorAll("span"),
		]
			.filter((span) => span.textContent === "alpha session 1")
			.pop();
		expect(scheduledTitle).toBeDefined();
		expect(
			(
				sessionRow("alpha session 1").querySelector(
					'[aria-label="Scheduled"]',
				) as Element
			).compareDocumentPosition(scheduledTitle as Element) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(
			sessionRow("alpha session 1").querySelector('[aria-label="已置顶"]'),
		).toBeNull();
		expect(
			sessionRow("alpha session 2").querySelector('[aria-label="Scheduled"]'),
		).not.toBeNull();
		expect(
			sessionRow("alpha session 2").querySelector('[aria-label="已置顶"]'),
		).not.toBeNull();
		expect(
			sessionRow("alpha session 3").querySelector('[aria-label="Scheduled"]'),
		).toBeNull();

		// The default time view groups these rows under category sections.
		expect(buttonWithText("已置顶")).toBeDefined();
		expect(
			buttonWithText(
				"计划任务",
				container.querySelector(
					"[data-radix-scroll-area-viewport]",
				) as ParentNode,
			),
		).toBeDefined();
		expect(
			buttonWithText(
				"任务",
				container.querySelector(
					"[data-radix-scroll-area-viewport]",
				) as ParentNode,
			),
		).toBeDefined();
	});

	it("folds a schedule's runs into one collapsible row", async () => {
		const run = (index: number) => ({
			...makeThread("alpha", index),
			title: "Report today's date to the user.",
			isScheduled: true,
			scheduleId: "sched_daily",
			scheduleName: "Daily date report",
			scheduleRunNumber: index,
		});
		const openThread = vi.fn();
		const sessionHistory = makeSessionHistory(
			[run(2), makeThread("beta", 1), run(1)],
			vi.fn(),
		);
		(sessionHistory as { openThread: unknown }).openThread = openThread;

		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={sessionHistory}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});

		// One header per schedule, named after the schedule rather than the
		// prompt, with the run count; the runs themselves start collapsed.
		const header = sessionRow("Daily date report");
		expect(header.textContent).toContain("2 runs");
		expect(header.getAttribute("aria-expanded")).toBe("false");
		expect(header.querySelector('[aria-label="Scheduled"]')).not.toBeNull();
		expect(sessionIsVisible("Report today's date to the user.")).toBe(false);
		expect(sessionIsVisible("Run 2")).toBe(false);
		// The Scheduled section counts schedules, not runs.
		expect(
			buttonWithText(
				"计划任务",
				container.querySelector(
					"[data-radix-scroll-area-viewport]",
				) as ParentNode,
			).textContent,
		).toContain("1");
		expect(sessionIsVisible("beta session 1")).toBe(true);

		await click(header);
		expect(header.getAttribute("aria-expanded")).toBe("true");
		expect(sessionIsVisible("Run 2")).toBe(true);
		expect(sessionIsVisible("Run 1")).toBe(true);
		// Nested runs don't repeat the clock the header already shows.
		expect(
			sessionRow("Run 1").querySelector('[aria-label="Scheduled"]'),
		).toBeNull();
		expect(
			sessionRow("Run 2").compareDocumentPosition(sessionRow("Run 1")) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();

		await click(sessionRow("Run 1"));
		expect(openThread).toHaveBeenCalledWith("alpha-1");

		await click(header);
		expect(sessionIsVisible("Run 1")).toBe(false);
	});

	it("expands the schedule group that holds the active session", async () => {
		const run = (index: number) => ({
			...makeThread("alpha", index),
			isScheduled: true,
			scheduleId: "sched_daily",
			scheduleName: "Daily date report",
			scheduleRunNumber: index,
		});
		const sessionHistory = makeSessionHistory([run(2), run(1)], vi.fn());
		const render = async (activeSessionId: string) => {
			await act(async () => {
				root.render(
					<SidebarProvider>
						<AgentSidebar
							activeSessionId={activeSessionId}
							onHome={vi.fn()}
							onSettingsSectionChange={vi.fn()}
							sessionHistory={sessionHistory}
							setView={vi.fn()}
							settingsSection="General"
							view="chat"
						/>
					</SidebarProvider>,
				);
			});
		};

		await render("alpha-1");
		expect(sessionRow("Daily date report").getAttribute("aria-expanded")).toBe(
			"true",
		);
		expect(sessionIsVisible("Run 1")).toBe(true);

		// The group can still be collapsed while it holds the active session,
		// and stays collapsed across re-renders.
		await click(sessionRow("Daily date report"));
		await render("alpha-1");
		expect(sessionIsVisible("Run 1")).toBe(false);

		// Opening another run of the schedule (e.g. from the Schedules
		// settings page) reopens the collapsed group so the run is visible.
		await render("alpha-2");
		expect(sessionRow("Daily date report").getAttribute("aria-expanded")).toBe(
			"true",
		);
		expect(sessionIsVisible("Run 2")).toBe(true);
	});

	it("groups scheduled runs inside their project when sorted by project", async () => {
		const run = (index: number) => ({
			...makeThread("alpha", index),
			isScheduled: true,
			scheduleId: "sched_daily",
			scheduleName: "Daily date report",
			scheduleRunNumber: index,
		});

		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={makeSessionHistory(
							[run(2), makeThread("alpha", 3), run(1)],
							vi.fn(),
						)}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});
		await switchToProjectSort();

		const header = sessionRow("Daily date report");
		expect(header.textContent).toContain("2 runs");
		expect(sessionIsVisible("alpha session 3")).toBe(true);
		expect(sessionIsVisible("Run 2")).toBe(false);
		await click(header);
		expect(sessionIsVisible("Run 2")).toBe(true);
	});

	it("defaults to Pinned, Scheduled, and Tasks sections sorted by time", async () => {
		const pinned = { ...makeThread("alpha", 1), pinned: true };
		const scheduled = { ...makeThread("beta", 1), isScheduled: true };
		const regular = makeThread("gamma", 1);

		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={makeSessionHistory(
							[regular, scheduled, pinned],
							vi.fn(),
						)}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});

		// Sections appear in Pinned, Scheduled, Tasks order.
		const pinnedHeader = buttonWithText("已置顶");
		const scheduledHeader = buttonWithText(
			"计划任务",
			container.querySelector(
				"[data-radix-scroll-area-viewport]",
			) as ParentNode,
		);
		const tasksHeader = [...container.querySelectorAll("button")].find(
			(button) => button.querySelector("span")?.textContent === "任务",
		) as HTMLButtonElement;
		expect(tasksHeader).toBeDefined();
		expect(
			pinnedHeader.compareDocumentPosition(scheduledHeader) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(
			scheduledHeader.compareDocumentPosition(tasksHeader) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(sessionIsVisible("alpha session 1")).toBe(true);
		expect(sessionIsVisible("beta session 1")).toBe(true);
		expect(sessionIsVisible("gamma session 1")).toBe(true);

		// Collapsing a section hides only its own rows.
		await click(scheduledHeader);
		expect(sessionIsVisible("beta session 1")).toBe(false);
		expect(sessionIsVisible("alpha session 1")).toBe(true);
		expect(sessionIsVisible("gamma session 1")).toBe(true);
	});

	it("deletes a session through the row's hover trash button", async () => {
		const deleteThread = vi.fn(async () => undefined);
		const sessionHistory = makeSessionHistory(
			[makeThread("alpha", 1)],
			vi.fn(),
		);
		(sessionHistory as { deleteThread: unknown }).deleteThread = deleteThread;

		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={sessionHistory}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});

		// The trash affordance is a sibling of the row button (buttons cannot
		// nest) and opens the same confirmation dialog as the context menu.
		const deleteButton = container.querySelector<HTMLButtonElement>(
			'[aria-label="删除 alpha session 1"]',
		);
		expect(deleteButton).not.toBeNull();
		expect(deleteButton?.closest("button")).toBe(deleteButton);
		await click(deleteButton as HTMLButtonElement);

		const confirm = await vi.waitFor(() => {
			const button = [...document.body.querySelectorAll("button")].find(
				(candidate) => candidate.textContent === "删除",
			);
			expect(button).toBeDefined();
			return button as HTMLButtonElement;
		});
		expect(document.body.textContent).toContain("删除会话？");
		await click(confirm);
		expect(deleteThread).toHaveBeenCalledWith("alpha-1");
	});

	it("pins sessions to the top of their project group in project sort", async () => {
		const pinned = { ...makeThread("alpha", 3), pinned: true };
		const threads = [makeThread("alpha", 1), makeThread("alpha", 2), pinned];

		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={makeSessionHistory(threads, vi.fn())}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});

		await switchToProjectSort();

		// The pinned session leads its project group despite being the oldest
		// entry in history order, and carries the pin icon inline; project
		// sort has no Pinned section header.
		const pinnedRow = sessionRow("alpha session 3");
		expect(pinnedRow.querySelector('[aria-label="已置顶"]')).not.toBeNull();
		for (const title of ["alpha session 1", "alpha session 2"]) {
			expect(
				pinnedRow.compareDocumentPosition(sessionRow(title)) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
		}
		expect(container.textContent).not.toContain("Pinned");
	});

	it("loads older history only on explicit Show more clicks", async () => {
		const tasks = Array.from({ length: 5 }, (_, index) =>
			makeThread("plain", index + 1),
		);
		const loadOlderSessions = vi.fn(async () => false);
		const renderSidebar = async (isLoadingMore: boolean) => {
			await act(async () => {
				root.render(
					<SidebarProvider>
						<AgentSidebar
							activeSessionId={null}
							onHome={vi.fn()}
							onSettingsSectionChange={vi.fn()}
							sessionHistory={makeSessionHistory(tasks, vi.fn(), {
								isLoadingMore,
								loadOlderSessions,
								mayHaveMoreSessions: true,
							})}
							setView={vi.fn()}
							settingsSection="General"
							view="chat"
						/>
					</SidebarProvider>,
				);
			});
		};

		await renderSidebar(false);
		await click(buttonWithText("Show more"));
		expect(loadOlderSessions).toHaveBeenCalledOnce();

		// A settled fetch never triggers an automatic follow-up request; only
		// another explicit click asks for more history.
		await renderSidebar(true);
		await renderSidebar(false);
		expect(loadOlderSessions).toHaveBeenCalledOnce();

		await click(buttonWithText("Show more"));
		expect(loadOlderSessions).toHaveBeenCalledTimes(2);
	});

	it("keeps a flat session list when nothing is pinned or scheduled", async () => {
		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={makeSessionHistory(
							[makeThread("plain", 1)],
							vi.fn(),
						)}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});

		expect(sessionIsVisible("plain session 1")).toBe(true);
		expect(container.textContent).not.toContain("Pinned");
		expect(container.textContent).not.toContain("Scheduled");
		expect(container.textContent).not.toContain("Tasks");
	});

	it("defaults to all sources and filters by the selected client source", async () => {
		const desktop = { ...makeThread("desktop", 1), source: "desktop" };
		const cli = { ...makeThread("cli", 1), source: "cli" };

		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={makeSessionHistory([desktop, cli], vi.fn())}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});

		expect(sessionIsVisible("desktop session 1")).toBe(true);
		expect(sessionIsVisible("cli session 1")).toBe(true);

		await click(container.querySelector('[aria-label="筛选会话"]') as Element);
		const cliOption = await vi.waitFor(() => {
			const option = [
				...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
			].find((candidate) => candidate.textContent === "CLI");
			expect(option).toBeDefined();
			return option as HTMLElement;
		});
		await click(cliOption);

		expect(sessionIsVisible("desktop session 1")).toBe(false);
		expect(sessionIsVisible("cli session 1")).toBe(true);
	});

	it("filters by Chinese status labels while preserving the runtime status values", async () => {
		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={makeSessionHistory(
							[
								{ ...makeThread("active", 1), status: "running" },
								makeThread("done", 1),
							],
							vi.fn(),
						)}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});
		await click(container.querySelector('[aria-label="筛选会话"]') as Element);
		const runningOption = await vi.waitFor(() => {
			const option = [
				...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
			].find((item) => item.textContent === "运行中");
			expect(option).toBeDefined();
			return option as HTMLElement;
		});
		await click(runningOption);
		expect(sessionIsVisible("active session 1")).toBe(true);
		expect(sessionIsVisible("done session 1")).toBe(false);
	});

	it("keeps the loading state until the first history response arrives", async () => {
		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={makeSessionHistory([], vi.fn(), {
							hasLoadedHistory: false,
						})}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});

		// Before the backend has answered, an empty list means "still loading",
		// never "no sessions": the definitive copy would read as lost history.
		expect(container.textContent).toContain("正在载入会话记录…");
		expect(container.textContent).not.toContain("没有找到会话记录。");
	});

	it("shows the empty state only after the backend answered with zero sessions", async () => {
		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={makeSessionHistory([], vi.fn(), {
							hasLoadedHistory: true,
						})}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});

		expect(container.textContent).toContain("没有找到会话记录。");
		expect(container.textContent).not.toContain("正在载入会话记录…");
	});

	it("builds the hover overview with branch and secondary metadata last", () => {
		const thread = {
			...makeThread("cline", 5),
			gitBranch: "bee/session-overview",
			inputTokens: 3_000_000,
			outputTokens: 9_000,
			totalCostUsd: 3.06,
		};

		expect(getSessionOverviewItems(thread)).toEqual([
			["工作目录", "cline", "/projects/cline"],
			["分支", "bee/session-overview"],
			["供应商", "cline"],
			["模型", "test-model"],
			["Token 用量", "3009k"],
			["费用", "$3.06"],
		]);
		expect(getSessionOverviewItems(makeThread("cline", 5))).not.toContainEqual([
			"分支",
			expect.anything(),
		]);
		expect(
			getSessionOverviewItems(thread).some(([label]) => label === "Status"),
		).toBe(false);
		// Scheduled runs lead with the schedule they belong to and which run
		// this is; the row itself only says "Run N".
		expect(
			getSessionOverviewItems({
				...makeThread("cline", 6),
				isScheduled: true,
				scheduleName: "Daily date report",
				scheduleRunNumber: 6,
			}).slice(0, 2),
		).toEqual([
			["计划任务", "Daily date report"],
			["运行次数", "6"],
		]);
	});

	it("shows the full first line of the session title", () => {
		const firstLine =
			"This is a complete session title that is intentionally longer than seventy characters for the hover overview";
		expect(getSessionOverviewTitle(`${firstLine}\nSecond line`)).toBe(
			firstLine,
		);
	});

	it("defaults to a time-sorted list and groups by project after switching sort", async () => {
		const threads = [
			...Array.from({ length: 35 }, (_, index) =>
				makeThread("alpha", index + 1),
			),
			...Array.from({ length: 35 }, (_, index) =>
				makeThread("beta", index + 1),
			),
		];
		const loadMoreSessions = vi.fn(async () => undefined);
		const loadOlderSessions = vi.fn(async () => undefined);
		const sessionHistory = makeSessionHistory(threads, loadMoreSessions, {
			loadOlderSessions,
			mayHaveMoreSessions: true,
		});

		await act(async () => {
			root.render(
				<SidebarProvider>
					<AgentSidebar
						activeSessionId={null}
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						sessionHistory={sessionHistory}
						setView={vi.fn()}
						settingsSection="General"
						view="chat"
					/>
				</SidebarProvider>,
			);
		});

		// The default view is a flat time-sorted list showing the first page
		// of 30 rows.
		expect(
			container.querySelector('[aria-label="Sort sessions: Time"]'),
		).not.toBeNull();
		expect(sessionIsVisible("alpha session 30")).toBe(true);
		expect(sessionIsVisible("alpha session 31")).toBe(false);
		expect(sessionIsVisible("beta session 1")).toBe(false);

		// The first page grows purely from already-loaded sessions (70 loaded,
		// 60 requested), so no history fetch is needed.
		await click(buttonWithText("Show more"));
		expect(sessionIsVisible("alpha session 31")).toBe(true);
		expect(loadMoreSessions).not.toHaveBeenCalled();
		expect(loadOlderSessions).not.toHaveBeenCalled();

		await switchToProjectSort();
		expect(container.textContent).toContain("alpha");
		expect(container.textContent).toContain("beta");
		expect(sessionIsVisible("beta session 30")).toBe(true);
		expect(sessionIsVisible("beta session 31")).toBe(false);
		expect(sessionIsVisible("alpha session 31")).toBe(false);

		// Expanding one project leaves the others' pagination untouched.
		await click(buttonWithText("显示 alpha 中的更多任务"));
		expect(sessionIsVisible("alpha session 31")).toBe(true);
		expect(sessionIsVisible("beta session 31")).toBe(false);
		expect(loadMoreSessions).not.toHaveBeenCalled();

		// The trailing Show more button grows the loaded history window.
		const globalShowMore = [
			...container.querySelectorAll<HTMLButtonElement>("button"),
		].find((button) => button.textContent?.trim() === "显示更多");
		expect(globalShowMore).toBeDefined();
		await click(globalShowMore as HTMLButtonElement);
		expect(loadOlderSessions).toHaveBeenCalledOnce();
	});

	it("shows the signed-in account and active organization in the footer", async () => {
		invoke.mockResolvedValue(signedInUser);

		await act(async () => {
			root.render(
				<AccountProvider>
					<SidebarProvider>
						<AgentSidebar
							activeSessionId={null}
							onHome={vi.fn()}
							onSettingsSectionChange={vi.fn()}
							sessionHistory={makeSessionHistory([], vi.fn())}
							setView={vi.fn()}
							settingsSection="General"
							view="chat"
						/>
					</SidebarProvider>
				</AccountProvider>,
			);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toContain("Beatrix");
			expect(container.textContent).toContain("Cline Bot Inc");
		});
		expect(container.textContent).not.toContain("Cline Desktop");
		expect(container.textContent).not.toContain("Local");
		const accountButton = container.querySelector('[aria-label="用户信息"]');
		const settingsButton = container.querySelector('[aria-label="设置"]');
		expect(accountButton?.parentElement).toBe(settingsButton?.parentElement);
		expect(settingsButton?.textContent).toBe("");
		const accountName = [
			...(accountButton?.querySelectorAll("span") ?? []),
		].find((element) => element.textContent === "Beatrix");
		const organizationName = [
			...(accountButton?.querySelectorAll("span") ?? []),
		].find((element) => element.textContent === "Cline Bot Inc");
		expect(accountName?.nextElementSibling).toBe(organizationName);
		expect(accountName?.parentElement?.className).toContain("flex-col");
	});

	it("keeps the footer user information non-interactive", async () => {
		const setView = vi.fn();
		const onSettingsSectionChange = vi.fn();
		invoke.mockResolvedValue(signedInUser);

		await act(async () => {
			root.render(
				<AccountProvider>
					<SidebarProvider>
						<AgentSidebar
							activeSessionId={null}
							onHome={vi.fn()}
							onSettingsSectionChange={onSettingsSectionChange}
							sessionHistory={makeSessionHistory([], vi.fn())}
							setView={setView}
							settingsSection="General"
							view="chat"
						/>
					</SidebarProvider>
				</AccountProvider>,
			);
		});

		const accountButton = await vi.waitFor(() => {
			const button = container.querySelector('[aria-label="用户信息"]');
			expect(button).not.toBeNull();
			return button;
		});
		await click(accountButton as Element);

		expect(onSettingsSectionChange).not.toHaveBeenCalled();
		expect(accountButton?.tagName).toBe("DIV");
		expect(accountButton?.getAttribute("tabindex")).toBeNull();
		expect(setView).not.toHaveBeenCalled();
	});

	it("shows only settings navigation and account children, and returns to the existing chat", async () => {
		invoke.mockResolvedValue(signedInUser);
		const setView = vi.fn();
		const onHome = vi.fn();
		const onSettingsSectionChange = vi.fn();
		const renderSidebar = async (
			section: "General" | "Account" | "AccountUsage" | "AccountBilling",
		) => {
			await act(async () =>
				root.render(
					<AccountProvider>
						<SidebarProvider>
							<AgentSidebar
								activeSessionId="existing-session"
								onHome={onHome}
								onSettingsSectionChange={onSettingsSectionChange}
								setView={setView}
								sessionHistory={makeSessionHistory(
									[makeThread("alpha", 1)],
									vi.fn(),
								)}
								settingsSection={section}
								view="settings"
							/>
						</SidebarProvider>
					</AccountProvider>,
				),
			);
		};
		await renderSidebar("General");
		for (const label of [
			"新会话",
			"计划任务",
			"搜索会话",
			"牛马主页",
			"侧边栏操作",
		]) {
			expect(container.querySelector(`[aria-label="${label}"]`)).toBeNull();
		}
		expect(sessionIsVisible("alpha session 1")).toBe(false);
		expect(container.querySelector('[aria-label="扩展"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="概览"]')).toBeNull();
		await renderSidebar("Account");
		for (const [section, label] of [
			["Account", "概览"],
			["AccountUsage", "用量"],
			["AccountBilling", "账单"],
		] as const) {
			const child = container.querySelector(
				`[aria-label="${label}"]`,
			) as HTMLButtonElement;
			expect(child.disabled).toBe(false);
			expect(child.className).toContain("pl-8!");
			await click(child);
			expect(onSettingsSectionChange).toHaveBeenLastCalledWith(section);
			await renderSidebar(section);
			expect(
				container
					.querySelector(`[aria-label="${label}"]`)
					?.getAttribute("aria-current"),
			).toBe("page");
		}
		await click(container.querySelector('[aria-label="返回应用"]') as Element);
		expect(setView).toHaveBeenCalledWith("chat");
		expect(onHome).not.toHaveBeenCalled();
	});

	it("disables account usage and billing children when signed out", async () => {
		await act(async () =>
			root.render(
				<SidebarProvider>
					<AgentSidebar
						onHome={vi.fn()}
						onSettingsSectionChange={vi.fn()}
						setView={vi.fn()}
						sessionHistory={makeSessionHistory([], vi.fn())}
						settingsSection="Account"
						view="settings"
					/>
				</SidebarProvider>,
			),
		);
		for (const label of ["用量", "账单"]) {
			expect(
				container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
					?.disabled,
			).toBe(true);
		}
		expect(
			container.querySelector<HTMLButtonElement>('[aria-label="概览"]')
				?.disabled,
		).toBe(false);
	});

	it("opens the General settings section from the gear in any section", async () => {
		invoke.mockResolvedValue(signedInUser);
		const onSettingsSectionChange = vi.fn();

		const renderSidebar = async (settingsSection: "Account" | "General") => {
			await act(async () => {
				root.render(
					<AccountProvider>
						<SidebarProvider>
							<AgentSidebar
								activeSessionId={null}
								onHome={vi.fn()}
								onSettingsSectionChange={onSettingsSectionChange}
								sessionHistory={makeSessionHistory([], vi.fn())}
								setView={vi.fn()}
								settingsSection={settingsSection}
								view="settings"
							/>
						</SidebarProvider>
					</AccountProvider>,
				);
			});
			return vi.waitFor(() => {
				const button = container.querySelector('[aria-label="设置"]');
				expect(button).not.toBeNull();
				return button as HTMLButtonElement;
			});
		};

		// The Account screen leaves the gear un-highlighted, but clicking it
		// still navigates to General rather than acting as a no-op.
		// (split on spaces: the variant's hover:bg-surface-hover would match a
		// plain substring check)
		const gearOnAccount = await renderSidebar("Account");
		expect(gearOnAccount.className.split(" ")).not.toContain(
			"bg-surface-hover",
		);
		await click(gearOnAccount);
		expect(onSettingsSectionChange).toHaveBeenCalledWith("General");

		const gearOnGeneral = await renderSidebar("General");
		expect(gearOnGeneral.className.split(" ")).toContain("bg-surface-hover");
	});

	it("shows the desktop app version and connected Hub when the logo is hovered", async () => {
		const onHome = vi.fn();
		invoke.mockImplementation(async (command: string) => {
			if (command === "get_process_context") {
				return {
					appVersion: "1.2.3",
					hub: {
						error: null,
						status: "connected",
						url: "ws://127.0.0.1:25463/hub",
					},
				};
			}
			throw new Error("No Cline account auth token found");
		});

		await act(async () => {
			root.render(
				<AccountProvider>
					<SidebarProvider>
						<AgentSidebar
							activeSessionId={null}
							onHome={onHome}
							onSettingsSectionChange={vi.fn()}
							sessionHistory={makeSessionHistory([], vi.fn())}
							setView={vi.fn()}
							settingsSection="General"
							view="chat"
						/>
					</SidebarProvider>
				</AccountProvider>,
			);
		});

		const logoButton = container.querySelector('[aria-label="牛马主页"]');
		expect(logoButton).not.toBeNull();
		expect(document.body.textContent).not.toContain("版本 1.2.3");

		await hover(logoButton as Element);

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("版本 1.2.3");
			expect(document.body.textContent).toContain("Cline Core @25463");
			expect(document.body.textContent).not.toContain(
				"ws://127.0.0.1:25463/hub",
			);
		});
		expect(onHome).not.toHaveBeenCalled();

		await click(logoButton as Element);
		expect(onHome).toHaveBeenCalled();
		expect(invoke).toHaveBeenCalledWith("get_process_context");
	});

	it("shows a disconnected Hub when process context has no live connection", async () => {
		invoke.mockResolvedValue({
			appVersion: "1.2.3",
			hub: {
				error: "Hub connection closed (code=1006)",
				status: "disconnected",
				url: "ws://127.0.0.1:25463/hub",
			},
		});

		await act(async () => {
			root.render(
				<AccountProvider>
					<SidebarProvider>
						<AgentSidebar
							activeSessionId={null}
							onHome={vi.fn()}
							onSettingsSectionChange={vi.fn()}
							sessionHistory={makeSessionHistory([], vi.fn())}
							setView={vi.fn()}
							settingsSection="General"
							view="chat"
						/>
					</SidebarProvider>
				</AccountProvider>,
			);
		});

		const logoButton = container.querySelector('[aria-label="牛马主页"]');
		expect(logoButton).not.toBeNull();
		await hover(logoButton as Element);

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain("Cline Core @25463");
			expect(document.body.textContent).toContain(
				"Hub connection closed (code=1006)",
			);
		});
	});

	it("hosts back and forward navigation in the draggable sidebar title bar", async () => {
		const onNavigateBack = vi.fn();
		const onNavigateForward = vi.fn();

		await act(async () => {
			root.render(
				<AccountProvider>
					<SidebarProvider>
						<AgentSidebar
							activeSessionId={null}
							canNavigateBack
							canNavigateForward
							onHome={vi.fn()}
							onNavigateBack={onNavigateBack}
							onNavigateForward={onNavigateForward}
							onSettingsSectionChange={vi.fn()}
							sessionHistory={makeSessionHistory([], vi.fn())}
							setView={vi.fn()}
							settingsSection="General"
							view="chat"
						/>
					</SidebarProvider>
				</AccountProvider>,
			);
		});

		const titleBar = container.querySelector("[data-tauri-drag-region]");
		expect(titleBar).not.toBeNull();
		expect(titleBar?.textContent).not.toContain("Cline");

		await click(
			container.querySelector('[aria-label="Previous page"]') as Element,
		);
		await click(container.querySelector('[aria-label="Next page"]') as Element);
		expect(onNavigateBack).toHaveBeenCalledOnce();
		expect(onNavigateForward).toHaveBeenCalledOnce();
	});

	it("keeps only New and Schedule actions outside settings", async () => {
		const onHome = vi.fn();
		const onSettingsSectionChange = vi.fn();
		await act(async () => {
			root.render(
				<AccountProvider>
					<SidebarProvider>
						<AgentSidebar
							activeSessionId={null}
							onHome={onHome}
							onSettingsSectionChange={onSettingsSectionChange}
							sessionHistory={makeSessionHistory([], vi.fn())}
							setView={vi.fn()}
							settingsSection="General"
							view="chat"
						/>
					</SidebarProvider>
				</AccountProvider>,
			);
		});

		const logo = container.querySelector('[aria-label="牛马主页"]');
		const actionsNav = container.querySelector('[aria-label="侧边栏操作"]');
		expect(logo).not.toBeNull();
		expect(actionsNav).not.toBeNull();
		// The rows read as labeled full-width entries stacked outside the
		// logo row, not ambiguous icons in the header cluster.
		const rows = [
			...(actionsNav?.querySelectorAll<HTMLButtonElement>("button") ?? []),
		];
		expect(rows.map((row) => row.textContent)).toEqual(["新会话", "计划任务"]);
		for (const row of rows) {
			expect(row.className).toContain("w-full");
		}
		expect(actionsNav?.contains(logo as Element)).toBe(false);

		await click(buttonWithText("新会话", actionsNav as ParentNode));
		expect(onHome).toHaveBeenCalledOnce();
		await click(buttonWithText("计划任务", actionsNav as ParentNode));
		expect(onSettingsSectionChange).toHaveBeenCalledWith("Schedules");
		expect(container.querySelector('[aria-label="扩展"]')).toBeNull();
	});

	it.each([
		true,
		false,
	])("keeps schedules in app navigation (expanded: %s)", async (expanded) => {
		const onSettingsSectionChange = vi.fn();
		const onHome = vi.fn();
		const setView = vi.fn();
		const history = makeSessionHistory([makeThread("Cowse", 1)], vi.fn());
		const render = async (
			view: "chat" | "settings",
			section: "General" | "Schedules",
		) => {
			await act(async () => {
				root.render(
					<AccountProvider>
						<SidebarProvider defaultOpen={expanded}>
							<AgentSidebar
								activeSessionId={null}
								onHome={onHome}
								onSettingsSectionChange={onSettingsSectionChange}
								sessionHistory={history}
								setView={setView}
								settingsSection={section}
								view={view}
							/>
						</SidebarProvider>
					</AccountProvider>,
				);
			});
		};
		await render("chat", "General");
		if (expanded) {
			await click(buttonWithText("计划任务"));
			expect(onSettingsSectionChange).toHaveBeenCalledWith("Schedules");
		}
		await render("settings", "Schedules");
		expect(container.querySelector('[aria-label="返回应用"]')).toBeNull();
		expect(container.querySelector('[aria-label="牛马主页"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="通用"]')).toBeNull();
		const gear = container.querySelector('[aria-label="设置"]')!;
			expect(gear.className.split(" ")).not.toContain("bg-surface-hover");
		if (expanded) {
			expect(buttonWithText("计划任务").getAttribute("aria-current")).toBe(
				"page",
			);
			expect(container.textContent).toContain("Cowse session 1");
			expect(
				container.querySelector('[title="搜索会话（Cmd/Ctrl+P）"]'),
			).not.toBeNull();
			await click(buttonWithText("新会话"));
			expect(onHome).toHaveBeenCalledOnce();
		}
		await click(gear);
		expect(onSettingsSectionChange).toHaveBeenCalledWith("General");
		await render("settings", "General");
		expect(container.querySelector('[aria-label="返回应用"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="计划任务"]')).toBeNull();
		// Returning through navigation history must restore the app sidebar.
		await render("settings", "Schedules");
		expect(container.querySelector('[aria-label="返回应用"]')).toBeNull();
		await render("chat", "Schedules");
		if (expanded)
			expect(
				buttonWithText("计划任务").getAttribute("aria-current"),
			).toBeNull();
	});

	it("shows Installed and Marketplace sub-tabs under the open Customize row", async () => {
		const onSettingsSectionChange = vi.fn();
		const renderSidebar = async (section: "Customize" | "Marketplace") => {
			await act(async () => {
				root.render(
					<AccountProvider>
						<SidebarProvider>
							<AgentSidebar
								activeSessionId={null}
								onHome={vi.fn()}
								onSettingsSectionChange={onSettingsSectionChange}
								sessionHistory={makeSessionHistory([], vi.fn())}
								setView={vi.fn()}
								settingsSection={section}
								view="settings"
							/>
						</SidebarProvider>
					</AccountProvider>,
				);
			});
		};

		await renderSidebar("Customize");
		const actionsNav = container.querySelector(
			'[aria-label="设置分类"]',
		) as ParentNode;
		const installedRow = buttonWithText("已安装", actionsNav);
		const marketplaceRow = buttonWithText("扩展市场", actionsNav);
		const customizeRow = buttonWithText("扩展", actionsNav);

		// The active sub-tab carries the full selected background; the parent
		// Customize row stays marked with a subtler highlight so the two
		// simultaneous highlights read differently.
		expect(installedRow.getAttribute("aria-current")).toBe("page");
		expect(installedRow.className.split(" ")).toContain("bg-surface-hover");
		expect(customizeRow.className.split(" ")).toContain(
			"bg-surface-hover-lighter",
		);
		expect(customizeRow.className.split(" ")).not.toContain("bg-surface-hover");
		// Sub-tabs are indented under the parent row.
		expect(installedRow.className.split(" ")).toContain("pl-8!");

		await click(marketplaceRow);
		expect(onSettingsSectionChange).toHaveBeenCalledWith("Marketplace");
		await renderSidebar("Marketplace");
		expect(
			buttonWithText("扩展市场", actionsNav).getAttribute("aria-current"),
		).toBe("page");
		expect(
			buttonWithText("已安装", actionsNav).getAttribute("aria-current"),
		).toBeNull();
	});

	it("highlights the New row only while the new-task page is active", async () => {
		const renderSidebar = async (newTaskActive: boolean) => {
			await act(async () => {
				root.render(
					<AccountProvider>
						<SidebarProvider>
							<AgentSidebar
								activeSessionId={null}
								newTaskActive={newTaskActive}
								onHome={vi.fn()}
								onSettingsSectionChange={vi.fn()}
								sessionHistory={makeSessionHistory([], vi.fn())}
								setView={vi.fn()}
								settingsSection="General"
								view="chat"
							/>
						</SidebarProvider>
					</AccountProvider>,
				);
			});
			return buttonWithText(
				"新会话",
				container.querySelector('[aria-label="侧边栏操作"]') as ParentNode,
			);
		};

		const activeRow = await renderSidebar(true);
		expect(activeRow.className.split(" ")).toContain("bg-surface-hover");
		expect(activeRow.getAttribute("aria-current")).toBe("page");

		const inactiveRow = await renderSidebar(false);
		expect(inactiveRow.className.split(" ")).not.toContain("bg-surface-hover");
		expect(inactiveRow.getAttribute("aria-current")).toBeNull();
	});

	it("opens the global search command bar from the logo-row icon without loading full history", async () => {
		const sessionHistory = makeSessionHistory(
			[makeThread("alpha", 1), makeThread("beta", 1)],
			vi.fn(),
		);
		const onOpenSearch = vi.fn();
		await act(async () => {
			root.render(
				<AccountProvider>
					<SidebarProvider>
						<AgentSidebar
							activeSessionId={null}
							onHome={vi.fn()}
							onOpenSearch={onOpenSearch}
							onSettingsSectionChange={vi.fn()}
							sessionHistory={sessionHistory}
							setView={vi.fn()}
							settingsSection="General"
							view="chat"
						/>
					</SidebarProvider>
				</AccountProvider>,
			);
		});

		// Search lives behind the logo-row icon, not an inline sidebar input.
		expect(container.querySelector("input")).toBeNull();
		const searchButton = container.querySelector(
			'button[aria-label="搜索会话"]',
		);
		expect(searchButton).not.toBeNull();
		await click(searchButton as Element);
		// The icon opens the indexed command bar owned by the page shell...
		expect(onOpenSearch).toHaveBeenCalledOnce();
		// ...instead of a sidebar-local dialog that eagerly pulled the entire
		// session history just to filter titles client-side.
		expect(sessionHistory.loadAllSessions).not.toHaveBeenCalled();
		expect(document.querySelector('[data-slot="command-input"]')).toBeNull();
	});

	it("uses the Cowse app icon for home in the collapsed sidebar", async () => {
		await act(async () => {
			root.render(
				<AccountProvider>
					<SidebarProvider defaultOpen={false}>
						<AgentSidebar
							activeSessionId={null}
							onHome={vi.fn()}
							onSettingsSectionChange={vi.fn()}
							sessionHistory={makeSessionHistory([], vi.fn())}
							setView={vi.fn()}
							settingsSection="General"
							view="chat"
						/>
					</SidebarProvider>
				</AccountProvider>,
			);
		});

		expect(container.querySelector('[aria-label="牛马主页"]')).not.toBeNull();
		expect(
			container
				.querySelector('[aria-label="牛马主页"] img')
				?.getAttribute("src"),
		).toBe("/app-icons/midnight.png");
		expect(container.querySelector('[aria-label="侧边栏操作"]')).toBeNull();
		expect(
			container.querySelector('[aria-label="展开侧边栏"]')?.className,
		).toContain("mt-auto");
	});

	it("uses a compact overlay-friendly width in collapsed settings", async () => {
		await act(async () => {
			root.render(
				<AccountProvider>
					<SidebarProvider defaultOpen={false}>
						<AgentSidebar
							activeSessionId={null}
							onHome={vi.fn()}
							onSettingsSectionChange={vi.fn()}
							sessionHistory={makeSessionHistory([], vi.fn())}
							setView={vi.fn()}
							settingsSection="Account"
							view="settings"
						/>
					</SidebarProvider>
				</AccountProvider>,
			);
		});

		const sidebarWrapper = container.querySelector<HTMLElement>(
			'[data-slot="sidebar-wrapper"]',
		);
		expect(sidebarWrapper?.style.getPropertyValue("--sidebar-width-icon")).toBe(
			"3rem",
		);
		expect(sidebarWrapper?.dataset.state).toBe("collapsed");
		expect(container.querySelector('[aria-label="设置分类"]')).not.toBeNull();
		const leftAlignedButtons = [
			"返回应用",
			"通用",
			"账户",
			"展开侧边栏",
			"设置",
		];
		for (const label of leftAlignedButtons) {
			const button = container.querySelector(`[aria-label="${label}"]`);
			expect(button?.className).not.toContain("mx-auto");
		}
		expect(
			container.querySelector('[aria-label="展开侧边栏"]')?.className,
		).toContain("mt-auto");
		expect(
			container.querySelector('[aria-label="设置分类"]')?.className,
		).toContain("items-start");
	});

	it("shows only the labeled Settings button when signed out", async () => {
		await act(async () => {
			root.render(
				<AccountProvider>
					<SidebarProvider>
						<AgentSidebar
							activeSessionId={null}
							onHome={vi.fn()}
							onSettingsSectionChange={vi.fn()}
							sessionHistory={makeSessionHistory([], vi.fn())}
							setView={vi.fn()}
							settingsSection="General"
							view="chat"
						/>
					</SidebarProvider>
				</AccountProvider>,
			);
		});

		await vi.waitFor(() =>
			expect(container.querySelector('[aria-label="设置"]')).not.toBeNull(),
		);
		expect(
			container.querySelector('[aria-label="Account settings"]'),
		).toBeNull();
		expect(
			container.querySelector('[aria-label="设置"]')?.textContent,
		).toContain("设置");
	});
});
