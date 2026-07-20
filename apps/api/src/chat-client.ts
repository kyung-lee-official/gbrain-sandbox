import { chatModel } from "./config.ts";

const DEFAULT_DEEPSEEK_BASE = "https://api.deepseek.com";

export function deepseekApiKey(): string {
	const key = process.env.DEEPSEEK_API_KEY?.trim();
	if (!key) {
		throw new Error(
			"DEEPSEEK_API_KEY is required for think-mode synthesis. Set it in .env at the repo root.",
		);
	}
	return key;
}

export function synthesisModelId(): string {
	const explicit = process.env.SYNTHESIS_MODEL?.trim();
	if (explicit) return explicit;
	const configured = chatModel();
	if (configured?.includes(":")) {
		return configured.split(":").slice(1).join(":");
	}
	if (configured) return configured;
	return "deepseek-chat";
}

function deepseekBaseUrl(): string {
	return (process.env.DEEPSEEK_API_BASE_URL ?? DEFAULT_DEEPSEEK_BASE).replace(
		/\/$/,
		"",
	);
}

/** Synthesize an answer from a fully assembled prompt (shared pages already inlined). */
export async function synthesizeAnswer(prompt: string): Promise<string> {
	const res = await fetch(`${deepseekBaseUrl()}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${deepseekApiKey()}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: synthesisModelId(),
			messages: [
				{
					role: "system",
					content:
						"You answer using only the shared brain pages and personal memory in the user message. Cite page slugs in brackets when relevant, e.g. [test-demo]. If the provided sources do not contain the answer, say so clearly.",
				},
				{ role: "user", content: prompt },
			],
			temperature: 0.2,
		}),
	});
	const text = await res.text();
	if (!res.ok) {
		throw new Error(`Chat synthesis failed (${res.status}): ${text}`);
	}
	let json: { choices?: Array<{ message?: { content?: string } }> };
	try {
		json = JSON.parse(text) as typeof json;
	} catch {
		throw new Error(`Chat synthesis returned non-JSON: ${text.slice(0, 200)}`);
	}
	const answer = json.choices?.[0]?.message?.content?.trim();
	if (!answer) throw new Error("Chat synthesis returned empty content");
	return answer;
}
