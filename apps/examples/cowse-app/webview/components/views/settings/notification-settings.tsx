import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	DESKTOP_NOTIFICATION_EVENT_TYPES,
	type DesktopNotificationEventType,
	type DesktopNotificationPermission,
	type DesktopNotificationSettings,
	getDesktopNotificationPermission,
	readDesktopNotificationSettings,
	requestDesktopNotificationPermission,
	writeDesktopNotificationSettings,
} from "@/lib/desktop-notifications";

const EVENT_COPY: Record<
	DesktopNotificationEventType,
	{ label: string; description: string }
> = {
	taskCompletion: {
		label: "任务已完成",
		description: "牛马完成任务或一轮操作时。",
	},
	approvalNeeded: {
		label: "需要批准",
		description: "工具正在等待你的批准时。",
	},
	questionAsked: {
		label: "需要回答",
		description: "牛马需要得到回答才能继续时。",
	},
	sessionError: {
		label: "会话出错",
		description: "任务因错误而停止时。",
	},
};

export function NotificationSettings() {
	const [settings, setSettings] = useState<DesktopNotificationSettings>(
		readDesktopNotificationSettings,
	);
	const [permission, setPermission] =
		useState<DesktopNotificationPermission | null>(null);
	const [requestingPermission, setRequestingPermission] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void getDesktopNotificationPermission().then((nextPermission) => {
			if (!cancelled) setPermission(nextPermission);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const requestPermission = useCallback(async () => {
		setRequestingPermission(true);
		try {
			setPermission(await requestDesktopNotificationPermission());
		} finally {
			setRequestingPermission(false);
		}
	}, []);

	const updatePreference = (
		eventType: DesktopNotificationEventType,
		field: "enabled" | "sound",
		value: boolean,
	) => {
		setSettings((current) => {
			const next = writeDesktopNotificationSettings({
				...current,
				[eventType]: { ...current[eventType], [field]: value },
			});
			return next;
		});
		if (value && permission !== "granted") {
			void requestPermission();
		}
	};

	const permissionControl =
		permission === "granted" ? (
			<span className="shrink-0 text-xs font-medium text-muted-foreground">
				系统已允许
			</span>
		) : permission === "unsupported" ? null : permission === null ? (
			<span className="shrink-0 text-xs text-muted-foreground">正在检查…</span>
		) : (
			<Button
				disabled={requestingPermission}
				onClick={() => void requestPermission()}
				size="sm"
				type="button"
				variant="outline"
			>
				{permission === "denied" ? "检查权限" : "允许通知"}
			</Button>
		);

	// One settings section: a top-level header row like the other General
	// settings, with the per-event matrix nested in a card so its rows read
	// as children of "Desktop notifications" rather than as siblings of
	// top-level settings like Dark mode.
	return (
		<div className="border-b py-4">
			<div className="flex items-center justify-between gap-5 max-[720px]:flex-col max-[720px]:items-stretch">
				<div className="flex flex-col gap-1">
					<p className="text-base font-semibold text-foreground">桌面通知</p>
					<p className="text-sm text-muted-foreground">
						仅在牛马窗口位于后台时通知。点击通知可打开对应会话。
					</p>
					{permission === "denied" ? (
						<p className="mt-1 text-xs text-destructive">
							系统设置已阻止通知。
						</p>
					) : null}
				</div>
				{permissionControl}
			</div>
			<div className="mt-4 rounded-lg border bg-card px-4">
				<div className="grid grid-cols-[minmax(0,1fr)_5rem_4rem] items-center gap-3 border-b py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					<span>事件</span>
					<span className="text-center">通知</span>
					<span className="text-center">声音</span>
				</div>
				{DESKTOP_NOTIFICATION_EVENT_TYPES.map((eventType) => {
					const copy = EVENT_COPY[eventType];
					const preference = settings[eventType];
					return (
						<div
							className="grid grid-cols-[minmax(0,1fr)_5rem_4rem] items-center gap-3 border-b py-3 last:border-b-0"
							key={eventType}
						>
							<div className="min-w-0">
								<p className="text-sm font-medium text-foreground">
									{copy.label}
								</p>
								<p className="text-xs text-muted-foreground">
									{copy.description}
								</p>
							</div>
							<div className="flex justify-center">
								<Switch
									aria-label={`${copy.label}通知`}
									checked={preference.enabled}
									onCheckedChange={(checked) =>
										updatePreference(eventType, "enabled", checked)
									}
								/>
							</div>
							<div className="flex justify-center">
								<Switch
									aria-label={`${copy.label}声音`}
									checked={preference.sound}
									disabled={!preference.enabled}
									onCheckedChange={(checked) =>
										updatePreference(eventType, "sound", checked)
									}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
