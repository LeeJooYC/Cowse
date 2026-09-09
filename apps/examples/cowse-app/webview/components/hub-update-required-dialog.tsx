"use client";
import { useEffect, useState } from "react";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { desktopClient } from "@/lib/desktop-client";
import {
	describeOutdatedHubSessions,
	shouldShowHubMismatchDialog,
} from "./hub-update-required-helpers";
type HubBuildMismatchPayload = {
	hubBuildId?: string;
	hubCoreVersion?: string;
	reason?: string;
	activeSessionCount?: number;
	participantClientCount?: number;
};
/** Informational only: never download, replace the shared Hub, or restart/quit. */
export function HubUpdateRequiredDialog() {
	const [mismatch, setMismatch] = useState<HubBuildMismatchPayload | null>(
		null,
	);
	const [dismissed, setDismissed] = useState(false);
	useEffect(
		() =>
			desktopClient.subscribe("hub_build_mismatch", (payload) => {
				if (payload === null) {
					setMismatch(null);
					setDismissed(false);
					return;
				}
				if (!payload || typeof payload !== "object") return;
				setMismatch(payload as HubBuildMismatchPayload);
				// Reconnect replays must not leave incompatible backends silently dismissed.
				setDismissed(false);
			}),
		[],
	);
	const outdated = mismatch?.reason === "outdated_hub";
	return (
		<AlertDialog
			open={!dismissed && shouldShowHubMismatchDialog(mismatch?.reason)}
			onOpenChange={(open) => {
				if (!open) setDismissed(true);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{outdated ? "后台版本较旧" : "后台协议不兼容"}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{outdated ? (
							<>
								当前牛马需要较新的 Cline 后台，但现有后台仍在服务
								{describeOutdatedHubSessions(mismatch ?? {})}
								。在完成版本协调前，部分功能可能无法使用。
							</>
						) : (
							<>
								当前牛马无法与正在运行的 Cline
								后台正常通信，依赖后台的功能暂不可用。
							</>
						)}
					</AlertDialogDescription>
					{mismatch?.hubCoreVersion ? (
						<AlertDialogDescription>
							后台核心版本：{mismatch.hubCoreVersion}
						</AlertDialogDescription>
					) : null}
					<AlertDialogDescription>
						牛马已禁用自动更新，不会下载更新或强制停止后台。请等待其他客户端的会话结束后，再手动处理后台并重新打开牛马；如果版本仍不兼容，请手动下载并安装匹配的牛马安装包。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>知道了</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
