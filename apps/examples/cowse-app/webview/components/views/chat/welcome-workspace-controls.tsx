"use client";

import { isChatWorkspacePath } from "@cline/shared/browser";
import {
	Check,
	FilePlus2,
	Folder,
	GitBranch,
	Plus,
	Search,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scrollCurrentOptionIntoView } from "@/lib/scroll-current-option";
import { cn } from "@/lib/utils";
import {
	looksLikeFolderPath,
	normalizeWorkspacePath,
} from "@/lib/workspace-paths";

function formatWorkspacePath(path: string): string {
	const unixHome = path.match(/^\/Users\/[^/]+\/(.*)$/);
	if (unixHome) return unixHome[1] ? `~/${unixHome[1]}` : "~";
	const linuxHome = path.match(/^\/home\/[^/]+\/(.*)$/);
	if (linuxHome) return linuxHome[1] ? `~/${linuxHome[1]}` : "~";
	const windowsHome = path.match(/^[A-Za-z]:\\Users\\[^\\]+\\(.*)$/);
	if (windowsHome) {
		const tail = windowsHome[1]?.replaceAll("\\", "/") || "";
		return tail ? `~/${tail}` : "~";
	}
	return path;
}

function workspaceName(path: string): string {
	const trimmed = path.trim().replace(/[\\/]+$/, "");
	if (!trimmed) return "工作目录";
	const parts = trimmed.split(/[\\/]/);
	return parts[parts.length - 1] || "工作目录";
}

const TRIGGER_CLASS =
	"inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PANEL_CLASS =
	"absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 motion-reduce:animate-none";

function SearchInput({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
}) {
	// Search row styled to match the composer's model picker.
	return (
		<div className="flex items-center gap-2 border-b border-border px-3">
			<Search className="size-3 shrink-0 text-muted-foreground" />
			<Input
				autoFocus
				className="h-8 flex-1 border-0 bg-transparent px-0 py-0 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				value={value}
			/>
		</div>
	);
}

function WorkspacePicker({
	open,
	onToggle,
	onClose,
	workspaceRoot,
	workspaces,
	onRefreshWorkspaces,
	onSwitchWorkspace,
	onRemoveWorkspace,
	onPickWorkspaceDirectory,
	onSelectChat,
}: {
	open: boolean;
	onToggle: () => void;
	onClose: () => void;
	workspaceRoot: string;
	workspaces: string[];
	onRefreshWorkspaces: () => Promise<void>;
	onSwitchWorkspace: (workspacePath: string) => Promise<boolean>;
	onRemoveWorkspace: (workspacePath: string) => Promise<boolean>;
	onPickWorkspaceDirectory: (initialPath?: string) => Promise<string | null>;
	onSelectChat: () => Promise<boolean>;
}) {
	const [search, setSearch] = useState("");
	const [switching, setSwitching] = useState(false);
	const [removingWorkspace, setRemovingWorkspace] = useState<string | null>(
		null,
	);
	const [picking, setPicking] = useState(false);
	const workspaceListRef = useRef<HTMLDivElement>(null);
	const [selectingChat, setSelectingChat] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isChatWorkspace =
		!workspaceRoot.trim() || isChatWorkspacePath(workspaceRoot);

	const normalizedWorkspaceRoot = useMemo(
		() => normalizeWorkspacePath(workspaceRoot),
		[workspaceRoot],
	);

	// Refresh the catalog and clear the filter each time the menu opens.
	// The refresh callback lives in a ref: its identity changes whenever the
	// workspace catalog re-derives (e.g. periodic session-history refresh), and
	// re-running this effect mid-open would wipe the user's typed path and any
	// visible error message.
	const refreshWorkspacesRef = useRef(onRefreshWorkspaces);
	useEffect(() => {
		refreshWorkspacesRef.current = onRefreshWorkspaces;
	}, [onRefreshWorkspaces]);
	useEffect(() => {
		if (!open) return;
		setSearch("");
		setError(null);
		void refreshWorkspacesRef.current();
	}, [open]);

	// Start the freshly opened list at the active workspace, not the top.
	useEffect(() => {
		if (open) scrollCurrentOptionIntoView(workspaceListRef.current);
	}, [open]);

	// The active workspace can be an excluded path (restored session, process
	// cwd fallback); register it explicitly so it stays visible while active.
	const availableWorkspaces = useMemo(() => {
		const byNormalizedPath = new Map<string, string>();
		const register = (path: string) => {
			const trimmed = path.trim();
			if (trimmed)
				byNormalizedPath.set(normalizeWorkspacePath(trimmed), trimmed);
		};
		if (!isChatWorkspace) register(workspaceRoot);
		for (const path of workspaces) register(path);
		return [...byNormalizedPath.values()];
	}, [isChatWorkspace, workspaceRoot, workspaces]);

	const filteredWorkspaces = availableWorkspaces.filter((path) =>
		path.toLowerCase().includes(search.toLowerCase()),
	);

	const handleSelect = async (path: string) => {
		const next = path.trim();
		if (!next || normalizeWorkspacePath(next) === normalizedWorkspaceRoot) {
			onClose();
			return;
		}
		if (switching) return;
		setError(null);
		setSwitching(true);
		const switched = await onSwitchWorkspace(next);
		setSwitching(false);
		if (switched) {
			onClose();
			return;
		}
		setError(`无法打开“${next}”。请确认文件夹存在后重试。`);
	};

	const handleAddWorkspace = async () => {
		if (picking || selectingChat || switching) return;
		setError(null);
		setPicking(true);
		try {
			const picked = await onPickWorkspaceDirectory(
				isChatWorkspace ? undefined : workspaceRoot || undefined,
			);
			if (picked?.trim()) await handleSelect(picked.trim());
		} catch (pickError) {
			setError(
				pickError instanceof Error && pickError.message.trim()
					? pickError.message
					: "无法打开文件夹选择器，请在上方输入文件夹路径。",
			);
		} finally {
			setPicking(false);
		}
	};

	const handleRemoveWorkspace = async (path: string) => {
		if (picking || selectingChat || switching || removingWorkspace) return;
		setError(null);
		setRemovingWorkspace(path);
		try {
			if (!(await onRemoveWorkspace(path))) {
				setError(`无法从最近使用中移除“${formatWorkspacePath(path)}”。`);
			}
		} finally {
			setRemovingWorkspace(null);
		}
	};

	const handleSelectChat = async () => {
		if (picking || selectingChat || switching) return;
		setSelectingChat(true);
		try {
			if (await onSelectChat()) onClose();
		} finally {
			setSelectingChat(false);
		}
	};

	const workspaceLabel = isChatWorkspace
		? "即时会话"
		: workspaceName(workspaceRoot);

	return (
		<div className="relative shrink-0">
			<button
				aria-expanded={open}
				aria-haspopup="menu"
				className={TRIGGER_CLASS}
				onClick={onToggle}
				title={workspaceLabel}
				type="button"
			>
				<Folder className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="max-w-44 truncate text-sm">{workspaceLabel}</span>
			</button>

			{open && (
				<div className={PANEL_CLASS}>
					<SearchInput
						onChange={(value) => {
							setSearch(value);
							setError(null);
						}}
						placeholder="搜索工作目录，或输入文件夹路径"
						value={search}
					/>
					<div className="p-1.5">
						{looksLikeFolderPath(search) && (
							<Button
								className="mb-0.5 flex h-auto w-full items-center justify-start gap-2 rounded-md p-2 text-left"
								disabled={switching}
								onClick={() => void handleSelect(search)}
								variant="ghost"
							>
								<Folder className="size-3 shrink-0 text-muted-foreground" />
								<span className="truncate text-xs text-foreground">
									打开文件夹“{search.trim()}”
								</span>
							</Button>
						)}
						<div
							className="flex max-h-48 flex-col gap-0.5 overflow-y-auto"
							ref={workspaceListRef}
						>
							{filteredWorkspaces.length === 0 ? (
								<div className="px-2 py-2 text-xs text-muted-foreground">
									{looksLikeFolderPath(search)
										? "点击上方选项打开此文件夹"
										: "没有找到工作目录，可输入完整路径添加"}
								</div>
							) : (
								filteredWorkspaces.map((path) => {
									const isActive =
										normalizeWorkspacePath(path) === normalizedWorkspaceRoot;
									return (
										<div
											className={cn(
												"group flex min-w-0 items-center rounded-md",
												isActive ? "bg-(--accent-4)" : "hover:bg-surface-hover",
											)}
											data-current={isActive || undefined}
											key={path}
										>
											<Button
												className="flex h-auto min-w-0 flex-1 items-center justify-between rounded-md p-2 text-left hover:bg-transparent"
												disabled={switching || removingWorkspace !== null}
												onClick={() => void handleSelect(path)}
												variant="ghost"
											>
												<span className="flex min-w-0 items-center gap-2">
													<Folder className="size-3 shrink-0 text-muted-foreground" />
													<span className="truncate text-xs text-foreground">
														{formatWorkspacePath(path)}
													</span>
												</span>
												{isActive && (
													<Check className="ml-2 size-3 shrink-0 text-foreground" />
												)}
											</Button>
											<Button
												aria-label={`从最近使用中移除 ${formatWorkspacePath(path)}`}
												className="mr-1 size-7 shrink-0 p-0 text-muted-foreground opacity-70 hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
												disabled={switching || removingWorkspace !== null}
												onClick={() => void handleRemoveWorkspace(path)}
												title="从最近使用中移除（不会删除文件夹）"
												variant="ghost"
											>
												<X className="size-3" />
											</Button>
										</div>
									);
								})
							)}
						</div>
						<Button
							className="mt-0.5 w-full justify-start text-xs text-muted-foreground"
							disabled={switching || picking || selectingChat}
							onClick={() => void handleAddWorkspace()}
							size="sm"
							variant="ghost"
						>
							<Plus className="size-3" />
							{picking ? "正在打开文件夹选择器…" : "打开文件夹…"}
						</Button>
						<Button
							className="w-full justify-start text-xs text-muted-foreground"
							disabled={switching || picking || selectingChat}
							onClick={() => void handleSelectChat()}
							size="sm"
							variant="ghost"
						>
							<FilePlus2 className="size-3" />
							{selectingChat ? "正在切换到即时会话…" : "即时会话"}
						</Button>
						{error && (
							<div className="mt-1 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
								{error}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function BranchPicker({
	open,
	onToggle,
	onClose,
	currentBranch,
	onListGitBranches,
	onSwitchGitBranch,
}: {
	open: boolean;
	onToggle: () => void;
	onClose: () => void;
	/** Always a real branch name: the parent only mounts this for git repos. */
	currentBranch: string;
	onListGitBranches: () => Promise<{ current: string; branches: string[] }>;
	onSwitchGitBranch: (branch: string) => Promise<boolean>;
}) {
	const [search, setSearch] = useState("");
	const [branches, setBranches] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [switching, setSwitching] = useState(false);
	const branchListRef = useRef<HTMLDivElement>(null);

	// Start the freshly opened list at the current branch, not the top.
	useEffect(() => {
		if (open && !loading) scrollCurrentOptionIntoView(branchListRef.current);
	}, [open, loading]);

	// Load branches fresh each time the menu opens.
	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setSearch("");
		setLoading(true);
		onListGitBranches()
			.then((payload) => {
				if (!cancelled) setBranches(payload.branches);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, onListGitBranches]);

	const branchLabel = currentBranch;

	const filteredBranches = branches.filter((branch) =>
		branch.toLowerCase().includes(search.toLowerCase()),
	);

	const handleSelect = async (branch: string) => {
		if (branch === currentBranch) {
			onClose();
			return;
		}
		if (switching) return;
		setSwitching(true);
		const switched = await onSwitchGitBranch(branch);
		setSwitching(false);
		if (switched) onClose();
	};

	return (
		<div className="relative min-w-0">
			<button
				aria-expanded={open}
				aria-haspopup="menu"
				className={cn(TRIGGER_CLASS, "min-w-0 max-w-full")}
				onClick={onToggle}
				title={branchLabel}
				type="button"
			>
				<GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 truncate text-sm">{branchLabel}</span>
			</button>

			{open && (
				<div className={PANEL_CLASS}>
					<SearchInput
						onChange={setSearch}
						placeholder="搜索分支"
						value={search}
					/>
					<div className="p-1.5">
						{loading ? (
							<div className="px-2 py-4 text-xs text-muted-foreground">
								正在加载…
							</div>
						) : (
							<div
								className="flex max-h-56 flex-col gap-0.5 overflow-y-auto"
								ref={branchListRef}
							>
								{filteredBranches.length === 0 ? (
									<div className="px-2 py-2 text-xs text-muted-foreground">
										未找到分支
									</div>
								) : (
									filteredBranches.map((branch) => (
										<Button
											className={cn(
												"flex h-auto items-center gap-2 rounded-md px-2 py-2 text-left",
												currentBranch === branch
													? "bg-(--accent-4) hover:bg-(--accent-4)"
													: "hover:bg-surface-hover",
											)}
											data-current={currentBranch === branch || undefined}
											disabled={switching}
											key={branch}
											onClick={() => void handleSelect(branch)}
											variant="ghost"
										>
											<GitBranch className="size-3 shrink-0 text-muted-foreground" />
											<span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
												{branch}
											</span>
											{currentBranch === branch && (
												<Check className="ml-auto size-3 shrink-0 text-foreground" />
											)}
										</Button>
									))
								)}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export function WelcomeWorkspaceControls({
	workspaceRoot,
	workspaces,
	onRefreshWorkspaces,
	onSwitchWorkspace,
	onRemoveWorkspace,
	onPickWorkspaceDirectory,
	onSelectChat,
	currentBranch,
	onListGitBranches,
	onSwitchGitBranch,
}: {
	workspaceRoot: string;
	workspaces: string[];
	onRefreshWorkspaces: () => Promise<void>;
	onSwitchWorkspace: (workspacePath: string) => Promise<boolean>;
	onRemoveWorkspace: (workspacePath: string) => Promise<boolean>;
	onPickWorkspaceDirectory: (initialPath?: string) => Promise<string | null>;
	onSelectChat: () => Promise<boolean>;
	/** Branch name, "no-git" for a non-repo folder, null while discovery is pending. */
	currentBranch: string | null;
	onListGitBranches: () => Promise<{ current: string; branches: string[] }>;
	onSwitchGitBranch: (branch: string) => Promise<boolean>;
}) {
	const [openMenu, setOpenMenu] = useState<"workspace" | "branch" | null>(null);
	const isChatWorkspace =
		!workspaceRoot.trim() || isChatWorkspacePath(workspaceRoot);
	const containerRef = useRef<HTMLDivElement>(null);

	// Close whichever menu is open when clicking outside the control row.
	useEffect(() => {
		if (!openMenu) return;
		const handlePointerDown = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setOpenMenu(null);
			}
		};
		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [openMenu]);

	return (
		<div className="flex min-w-0 items-center gap-2" ref={containerRef}>
			<WorkspacePicker
				onClose={() => setOpenMenu(null)}
				onPickWorkspaceDirectory={onPickWorkspaceDirectory}
				onRefreshWorkspaces={onRefreshWorkspaces}
				onRemoveWorkspace={onRemoveWorkspace}
				onSelectChat={onSelectChat}
				onSwitchWorkspace={onSwitchWorkspace}
				onToggle={() =>
					setOpenMenu((current) =>
						current === "workspace" ? null : "workspace",
					)
				}
				open={openMenu === "workspace"}
				workspaceRoot={workspaceRoot}
				workspaces={workspaces}
			/>
			{/* Git is a developer affordance: a plain (non-git) folder gets no
			    branch chrome at all instead of a confusing "No branch" chip.
			    Pending discovery (null) is treated the same until it resolves. */}
			{!isChatWorkspace &&
			currentBranch !== null &&
			currentBranch !== "no-git" ? (
				<BranchPicker
					currentBranch={currentBranch}
					onClose={() => setOpenMenu(null)}
					onListGitBranches={onListGitBranches}
					onSwitchGitBranch={onSwitchGitBranch}
					onToggle={() =>
						setOpenMenu((current) => (current === "branch" ? null : "branch"))
					}
					open={openMenu === "branch"}
				/>
			) : null}
		</div>
	);
}
