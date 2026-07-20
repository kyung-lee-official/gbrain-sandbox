export type RetrievalHit = {
	slug: string;
	score: number;
	title?: string;
	/** Extra numeric fields from gbrain (e.g. base_score, vector/keyword factors). */
	factors: Record<string, number>;
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
		const factors = numericFactorsFromRow(row);
		const score =
			typeof row.score === "number"
				? row.score
				: typeof row.base_score === "number"
					? row.base_score
					: 0;
		const title = typeof row.title === "string" ? row.title : undefined;
		const prev = bySlug.get(slug);
		if (!prev || score > prev.score) {
			bySlug.set(slug, { slug, score, title, factors });
		}
	}
	return [...bySlug.values()].sort((a, b) => b.score - a.score);
}

/** Log ranked query hits (score + any extra factors) to the API console. */
export function logRetrievalHits(
	label: string,
	query: string,
	hits: RetrievalHit[],
	selectedSlugs?: string[],
): void {
	const selected = selectedSlugs ? new Set(selectedSlugs) : null;
	console.log(`[query hits] ${label} q=${JSON.stringify(query)} n=${hits.length}`);
	if (hits.length === 0) {
		console.log("  (no hits)");
		return;
	}
	const topScore = hits[0]?.score ?? 0;
	for (const [i, hit] of hits.entries()) {
		const ratio =
			topScore > 0 ? (hit.score / topScore).toFixed(3) : "n/a";
		const mark = selected?.has(hit.slug) ? " selected" : "";
		const factorParts = Object.entries(hit.factors)
			.filter(([key]) => key !== "score")
			.map(([key, value]) => `${key}=${formatScore(value)}`)
			.join(" ");
		const title = hit.title ? ` title=${JSON.stringify(hit.title)}` : "";
		console.log(
			`  #${i + 1} score=${formatScore(hit.score)} ratio=${ratio}${mark} slug=${hit.slug}${title}${factorParts ? ` ${factorParts}` : ""}`,
		);
	}
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

function numericFactorsFromRow(row: Record<string, unknown>): Record<string, number> {
	const factors: Record<string, number> = {};
	for (const [key, value] of Object.entries(row)) {
		if (typeof value === "number" && Number.isFinite(value)) {
			factors[key] = value;
		}
	}
	return factors;
}

function formatScore(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(4);
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
