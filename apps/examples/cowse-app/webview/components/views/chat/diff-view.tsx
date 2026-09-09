"use client";

import { ToolFileDiff } from "@cline/ui/components/agent-chat/tool-diff";
import {
	AppWindow,
	Check,
	ChevronDown,
	ChevronRight,
	Copy,
	ExternalLink,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { desktopClient } from "@/lib/desktop-client";
import type { SessionDiffHunk, SessionFileDiff } from "@/lib/session-diff";
import { cn } from "@/lib/utils";
import { resolveWorkspaceFilePath } from "@/lib/workspace-paths";
import { EditorIcon } from "./editor-icons";

type DiffViewProps = {
	fileDiffs: SessionFileDiff[];
	cwd?: string;
	onClose: () => void;
};

type EditorOption = {
	id: string;
	label: string;
};

export function DiffView({ fileDiffs, cwd, onClose }: DiffViewProps) {
	const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
	const [editors, setEditors] = useState<EditorOption[]>([]);

	useEffect(() => {
		let cancelled = false;
		desktopClient
			.invoke<EditorOption[]>("list_available_editors")
			.then((list) => {
				if (!cancelled && Array.isArray(list)) setEditors(list);
			})
			.catch(() => {
				// Older sidecars don't support the command; the menu still
				// offers the system default opener.
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const _totals = useMemo(
		() =>
			fileDiffs.reduce(
				(acc, file) => {
					acc.additions += file.additions;
					acc.deletions += file.deletions;
					return acc;
				},
				{ additions: 0, deletions: 0 },
			),
		[fileDiffs],
	);

	const toggleFileCollapse = (filename: string) => {
		setCollapsedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(filename)) {
				next.delete(filename);
			} else {
				next.add(filename);
			}
			return next;
		});
	};

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-card px-4">
				<div className="flex items-center gap-3">
					<span className="text-xs font-medium text-foreground">
						未提交的更改
					</span>
					<span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
						文件： {fileDiffs.length}
					</span>
				</div>

				<div className="flex items-center gap-2 text-xs font-mono">
					{" "}
					<button
						aria-label="关闭差异视图"
						className="rounded-md p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
						onClick={onClose}
						type="button"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				{fileDiffs.length === 0 ? (
					<div className="flex h-full items-center justify-center px-4 py-16 text-sm text-muted-foreground">
						此会话暂无文件更改。
					</div>
				) : (
					<div className="flex flex-col">
						{fileDiffs.map((file) => (
							<DiffFileSection
								collapsed={collapsedFiles.has(file.path)}
								cwd={cwd}
								editors={editors}
								file={file}
								key={file.path}
								onToggle={() => toggleFileCollapse(file.path)}
							/>
						))}
					</div>
				)}
			</ScrollArea>
		</div>
	);
}

function DiffFileSection({
	file,
	collapsed,
	cwd,
	editors,
	onToggle,
}: {
	file: SessionFileDiff;
	collapsed: boolean;
	cwd?: string;
	editors: EditorOption[];
	onToggle: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const [opening, setOpening] = useState(false);
	const copyResetTimerRef = useRef<number | null>(null);
	const resolvedPath = resolveWorkspaceFilePath(file.path, cwd);

	const handleCopyPath = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(resolvedPath);
			setCopied(true);
			if (copyResetTimerRef.current !== null) {
				window.clearTimeout(copyResetTimerRef.current);
			}
			copyResetTimerRef.current = window.setTimeout(() => {
				setCopied(false);
				copyResetTimerRef.current = null;
			}, 1600);
		} catch {
			toast({
				variant: "destructive",
				title: "复制失败",
				description: "无法将文件路径复制到剪贴板。",
			});
		}
	}, [resolvedPath]);

	const handleOpenInEditor = useCallback(
		async (editor?: string) => {
			setOpening(true);
			try {
				await desktopClient.invoke("open_file_in_editor", {
					path: file.path,
					...(cwd?.trim() ? { cwd } : {}),
					...(editor ? { editor } : {}),
				});
			} catch (error) {
				toast({
					variant: "destructive",
					title: "无法打开文件",
					description:
						error instanceof Error
							? error.message
							: "无法在编辑器中打开此文件。",
				});
			} finally {
				setOpening(false);
			}
		},
		[file.path, cwd],
	);

	return (
		<div className="border-b border-border">
			<div className="group flex w-full items-center gap-2 bg-card/80 px-4 py-2 hover:bg-surface-hover-lighter transition-colors">
				<button
					className="flex min-w-0 shrink items-center gap-2 text-left"
					onClick={onToggle}
					type="button"
				>
					{collapsed ? (
						<ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					) : (
						<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					)}
					<span className="min-w-0 truncate font-mono text-xs text-foreground">
						{file.path}
					</span>
				</button>
				<button
					aria-label={`复制文件路径：${file.path}`}
					className={cn(
						"shrink-0 rounded-md p-1 text-muted-foreground transition-opacity hover:bg-surface-hover hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
						copied ? "opacity-100 text-primary" : "opacity-0",
					)}
					onClick={() => void handleCopyPath()}
					title="复制文件路径"
					type="button"
				>
					{copied ? (
						<Check className="h-3.5 w-3.5" />
					) : (
						<Copy className="h-3.5 w-3.5" />
					)}
				</button>
				{/* Invisible flex spacer that keeps the dead space between the
				    path and the right-aligned actions clickable as a toggle. */}
				<button
					aria-hidden
					className="h-6 min-w-0 flex-1 cursor-pointer"
					onClick={onToggle}
					tabIndex={-1}
					type="button"
				/>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							aria-label={`在编辑器中打开 ${file.path}`}
							className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50 data-[state=open]:opacity-100 data-[state=open]:bg-surface-hover data-[state=open]:text-foreground"
							disabled={opening}
							title="在编辑器中打开"
							type="button"
						>
							<ExternalLink className="h-3.5 w-3.5" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<DropdownMenuLabel>打开方式</DropdownMenuLabel>
						{editors.map((editor) => (
							<DropdownMenuItem
								key={editor.id}
								onSelect={() => void handleOpenInEditor(editor.id)}
							>
								<EditorIcon editorId={editor.id} />
								{editor.label}
							</DropdownMenuItem>
						))}
						{editors.length > 0 && <DropdownMenuSeparator />}
						<DropdownMenuItem
							onSelect={() => void handleOpenInEditor("default")}
						>
							<AppWindow aria-hidden />
							系统默认
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<span className="shrink-0 font-mono text-[11px] text-primary">
					+{file.additions}
				</span>
				<span className="shrink-0 font-mono text-[11px] text-destructive">
					-{file.deletions}
				</span>
			</div>

			{!collapsed && (
				<div className="space-y-2 border-t border-border bg-card/40 px-4 py-3">
					{file.hunks.length === 0 ? (
						<p className="text-xs text-muted-foreground">暂无更改片段详情。</p>
					) : (
						// The index disambiguates repeated same-shaped hunks (e.g.
						// a file created twice with identical contents); hunks
						// never reorder within a file, so it is a stable key.
						file.hunks.map((hunk, index) => (
							<DiffHunk
								hunk={hunk}
								key={`${file.path}-${index}-${hunk.oldStart}-${hunk.newStart}-${hunk.old.length}-${hunk.new.length}`}
								path={file.path}
							/>
						))
					)}
				</div>
			)}
		</div>
	);
}

function DiffHunk({ hunk, path }: { hunk: SessionDiffHunk; path: string }) {
	// A hunk with no old side that starts at line 1 on both sides carries the
	// complete new contents (editor `create`, apply_patch Add File). Chat tool
	// rows render those with complete-file semantics (real line numbers);
	// everything else is a file fragment, which hides line numbers — see
	// ToolCallRow in chat-messages.tsx. Matching that keeps both surfaces
	// visually in agreement.
	const isCompleteNewContents =
		hunk.old.length === 0 && hunk.oldStart === 1 && hunk.newStart === 1;

	return (
		<ToolFileDiff
			background="var(--background)"
			className="cline-chat-selectable"
			fragment={!isCompleteNewContents}
			newText={hunk.new}
			oldText={isCompleteNewContents ? undefined : hunk.old}
			path={path}
		/>
	);
}
