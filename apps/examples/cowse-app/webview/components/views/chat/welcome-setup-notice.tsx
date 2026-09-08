"use client";

import { Cable } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown on the welcome screen when no model provider has credentials yet.
 * Without it the composer looks fully functional and the first prompt dies
 * with an opaque failure — the single worst moment of the first-run flow.
 */
export function WelcomeSetupNotice({
	onOpenSetup,
	onOpenModelSettings,
}: {
	onOpenSetup: () => void;
	onOpenModelSettings: () => void;
}) {
	return (
		// <output> carries an implicit "status" role, announcing the notice to
		// assistive tech when it appears.
		<output className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 backdrop-blur-sm">
			<div className="flex min-w-0 items-start gap-3">
				<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
					<Cable className="size-4" />
				</span>
				<div className="min-w-0">
					<p className="text-sm font-semibold text-foreground">
						连接模型后即可开始
					</p>
					<p className="mt-0.5 text-[13px] text-muted-foreground">
						连接本地部署或联网在线的 OpenAI-compatible 服务。
					</p>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Button
					className="rounded-full"
					onClick={onOpenSetup}
					size="sm"
					type="button"
				>
					连接模型
				</Button>
				<Button
					className="rounded-full"
					onClick={onOpenModelSettings}
					size="sm"
					type="button"
					variant="ghost"
				>
					模型设置
				</Button>
			</div>
		</output>
	);
}
