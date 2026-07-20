import type { AppMemory, AppMessage } from "./db.ts";
import { buildSynthesisPrompt } from "./context.ts";
import { synthesizeAnswer } from "./chat-client.ts";
import { gbrainGetPage, gbrainQueryHits } from "./gbrain-client.ts";
import {
	hydrateConfigFromEnv,
	logRetrievalHits,
	parseRetrievalHits,
	selectSlugsForHydrate,
} from "./retrieval.ts";

/** Retrieve full shared pages via gbrain, then synthesize in Bun (avoids think 600-char clips). */
export async function answerWithHydratedPages(
	recentMessages: AppMessage[],
	userMessage: string,
	personalMemories: AppMemory[],
): Promise<string> {
	const hitsRaw = await gbrainQueryHits(userMessage);
	const hits = parseRetrievalHits(hitsRaw);
	const config = hydrateConfigFromEnv();
	const slugs = selectSlugsForHydrate(hits, config);
	logRetrievalHits("think hydrate", userMessage, hits, slugs);

	const sharedPages: Array<{ slug: string; title?: string; body: string }> = [];
	let totalChars = 0;
	for (const slug of slugs) {
		if (totalChars >= config.maxTotalChars) break;
		const page = await gbrainGetPage(slug);
		const body = trimPageBody(page.compiled_truth, config.maxCharsPerPage);
		if (!body) continue;
		sharedPages.push({ slug: page.slug, title: page.title, body });
		totalChars += body.length;
	}

	const prompt = buildSynthesisPrompt(
		recentMessages,
		userMessage,
		personalMemories,
		sharedPages,
	);
	return synthesizeAnswer(prompt);
}

function trimPageBody(text: string, maxChars: number): string {
	const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, maxChars)}\n\n[page truncated]`;
}
