"use client";

import { Power } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { desktopClient, isTauriAvailable } from "@/lib/desktop-client";

export function FullQuitSettings() {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [prepared, setPrepared] = useState(false);
	async function quit() {
		if (busy) return;
		setBusy(true);
		setError(null);
		try {
			if (!prepared) {
				await desktopClient.invoke("prepare_full_quit");
				setPrepared(true);
			}
			await desktopClient.invoke("quit_app");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="flex py-4 items-center justify-between gap-5 border-t max-[720px]:flex-col max-[720px]:items-stretch">
			<div className="flex flex-col gap-1">
				<p className="text-base font-semibold text-foreground">完全退出</p>
				<p className="text-sm text-muted-foreground">
					退出牛马并停止本地 Cline
					后台，不删除会话记录。有任务运行或排队时暂不退出。
				</p>
			</div>
			<Button
				type="button"
				size="sm"
				variant="outline"
				className="shrink-0"
				disabled={!isTauriAvailable()}
				onClick={() => {
					setError(null);
					setOpen(true);
				}}
			>
				<Power className="size-3" />
				完全退出
			</Button>
			<Dialog
				open={open}
				onOpenChange={(value) => {
					if (!busy && !prepared) setOpen(value);
				}}
			>
				<DialogContent showCloseButton={!busy && !prepared}>
					<DialogHeader>
						<DialogTitle>完全退出牛马？</DialogTitle>
						<DialogDescription>
							将关闭应用窗口及本地后台服务，会话记录会保留。其他使用此后台的
							Cline 客户端会断开，可能自行重连并重新启动后台。
						</DialogDescription>
					</DialogHeader>
					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Button
							variant="outline"
							disabled={busy || prepared}
							onClick={() => setOpen(false)}
						>
							取消
						</Button>
						<Button disabled={busy} onClick={() => void quit()}>
							{busy ? "正在退出…" : "确认退出"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
