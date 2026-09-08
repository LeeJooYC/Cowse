"use client";

import { CowseLogo } from "@/components/cowse-logo";
import { cn } from "@/lib/utils";

/** 牛马的纯界面品牌组件；任务能力仍全部由 Cline Core 提供。 */
export function CowseWelcomeHero({
	compact = false,
}: {
	compact?: boolean;
}) {
	return (
		<div
			data-welcome-hero
			aria-hidden="true"
			className={cn(
				"mx-auto flex items-center justify-center",
				compact ? "size-24" : "size-28",
			)}
		>
			<CowseLogo className="size-full" />
		</div>
	);
}
