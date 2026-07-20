export type RetrievalHit = {
	slug: string;
	score: number;
	title?: string;
};

export type HydrateSelectionConfig = {
	/** Include hits with score >= topScore * ratio. */
	scoreRatio: number;
	maxPages: number;
	maxTotalChars: number;
	maxCharsPerPage: number;
};

export function hydrateConfigFromEnv(): HydrateSelectionConfig {
	const scoreRatio = readRequiredFloatEnv("HYDRATE_SCORE_RATIO");
	const maxPages = readRequiredIntEnv("HYDRATE_MAX_PAGES");
	const maxTotalChars = readRequiredIntEnv("HYDRATE_MAX_TOTAL_CHARS");
	const maxCharsPerPage = readRequiredIntEnv("HYDRATE_MAX_CHARS_PER_PAGE");
	return {
		scoreRatio: clamp(scoreRatio, 0.05, 1),
		maxPages: Math.max(1, maxPages),
		maxTotalChars: Math.max(1000, maxTotalChars),
		maxCharsPerPage: Math.max(500, maxCharsPerPage),
	};
}

export function parseRetrievalHits(raw: unknown): RetrievalHit[] {
	if (!Array.isArray(raw)) return [];
	const bySlug = new Map<string, RetrievalHit>();
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const row = item as Record<string, unknown>;
		const slug = typeof row.slug === "string" ? row.slug.trim() : "";
		if (!slug) continue;
		const score =
			typeof row.score === "number"
				? row.score
				: typeof row.base_score === "number"
					? row.base_score
					: 0;
		const title = typeof row.title === "string" ? row.title : undefined;
		const prev = bySlug.get(slug);
		if (!prev || score > prev.score) {
			bySlug.set(slug, { slug, score, title });
		}
	}
	return [...bySlug.values()].sort((a, b) => b.score - a.score);
}

/** Pick slugs by relative score threshold, capped by page count and char budget. */
export function selectSlugsForHydrate(
	hits: RetrievalHit[],
	config: HydrateSelectionConfig,
): string[] {
	if (hits.length === 0) return [];
	const topScore = hits[0]?.score ?? 0;
	const floor =
		topScore > 0 ? topScore * config.scoreRatio : Number.NEGATIVE_INFINITY;

	const selected: string[] = [];
	let totalChars = 0;
	for (const hit of hits) {
		if (selected.length >= config.maxPages) break;
		if (topScore > 0 && hit.score < floor) break;
		selected.push(hit.slug);
		totalChars += config.maxCharsPerPage;
		if (totalChars >= config.maxTotalChars) break;
	}
	return selected;
}

function readRequiredFloatEnv(name: string): number {
	const raw = process.env[name]?.trim();
	if (!raw) {
		throw new Error(
			`${name} is required for think-mode page hydrate. Set it in .env at the repo root.`,
		);
	}
	const n = Number.parseFloat(raw);
	if (!Number.isFinite(n)) {
		throw new Error(`${name} must be a number (got ${JSON.stringify(raw)}).`);
	}
	return n;
}

function readRequiredIntEnv(name: string): number {
	const raw = process.env[name]?.trim();
	if (!raw) {
		throw new Error(
			`${name} is required for think-mode page hydrate. Set it in .env at the repo root.`,
		);
	}
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n)) {
		throw new Error(`${name} must be an integer (got ${JSON.stringify(raw)}).`);
	}
	return n;
}

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}
