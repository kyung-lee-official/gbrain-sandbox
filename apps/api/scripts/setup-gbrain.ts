/**
 * Register shared-source + one app-level OAuth client for gbrain think.
 * Personal memory lives in app Postgres (`app_memories`).
 *
 * Bun-only (no node: imports).
 */
import {
	appDatabaseUrl,
	DEMO_API_KEYS,
	SHARED_OAUTH_CLIENT_NAME,
	SHARED_SOURCE_ID,
} from "../src/config.ts";
import {
	closeDb,
	getGbrainAuth,
	migrate,
	upsertGbrainAuth,
	upsertUser,
} from "../src/db.ts";

/** Monorepo root (apps/api/scripts → ../../..) — gbrain + shared-source live here. */
const REPO_ROOT = `${import.meta.dir}/../../..`;

type OAuthRegistration = {
	clientId: string;
	clientSecret: string;
};

function run(cmd: string[], cwd = REPO_ROOT): string {
	const proc = Bun.spawnSync(cmd, {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});
	const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : "";
	const stderr = proc.stderr ? new TextDecoder().decode(proc.stderr) : "";
	const out = `${stdout}${stderr}`.trim();
	if (proc.exitCode !== 0) {
		throw new Error(out || `${cmd.join(" ")} exited ${proc.exitCode}`);
	}
	return out;
}

function runGbrain(args: string[]): string {
	return run(["gbrain", ...args]);
}

function runGbrainAllowExists(args: string[]): void {
	try {
		runGbrain(args);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (/already exists|duplicate|registered/i.test(msg)) {
			console.log(`(skip) gbrain ${args.join(" ")} — ${msg.split("\n")[0]}`);
			return;
		}
		throw err;
	}
}

function parseOAuthRegistration(output: string): OAuthRegistration {
	const clientId = output.match(/Client ID:\s+(\S+)/i)?.[1];
	const clientSecret = output.match(/Client Secret:\s+(\S+)/i)?.[1];
	if (!clientId || !clientSecret) {
		throw new Error(`Could not parse OAuth registration output:\n${output}`);
	}
	return { clientId, clientSecret };
}

async function ensureGitRepo(relativeDir: string): Promise<void> {
	const dir = `${REPO_ROOT}/${relativeDir}`;
	const inside = Bun.spawnSync(["git", "rev-parse", "--is-inside-work-tree"], {
		cwd: dir,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (inside.exitCode !== 0) {
		run(["git", "init"], dir);
		console.log(`Initialized git repo: ${relativeDir}`);
	}
	const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
		cwd: dir,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (head.exitCode !== 0) {
		run(["git", "add", "-A"], dir);
		run(
			["git", "commit", "-m", "chore: initial source commit", "--allow-empty"],
			dir,
		);
		console.log(`Created initial commit: ${relativeDir}`);
	}
}

async function ensureSharedOAuth(force: boolean): Promise<OAuthRegistration> {
	const existing = await getGbrainAuth();
	if (!force && existing) {
		console.log(
			`(skip) Shared OAuth — already configured (${existing.oauth_client_id})`,
		);
		return {
			clientId: existing.oauth_client_id,
			clientSecret: existing.oauth_client_secret,
		};
	}

	if (existing && force) {
		try {
			runGbrain(["auth", "revoke-client", existing.oauth_client_id]);
			console.log("Revoked prior shared OAuth client");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(
				`Could not revoke prior OAuth client: ${msg.split("\n")[0]}`,
			);
		}
	}

	const out = runGbrain([
		"auth",
		"register-client",
		SHARED_OAUTH_CLIENT_NAME,
		"--grant-types",
		"client_credentials",
		"--scopes",
		"read write",
		"--source",
		SHARED_SOURCE_ID,
		"--federated-read",
		SHARED_SOURCE_ID,
	]);
	return parseOAuthRegistration(out);
}

async function main(): Promise<void> {
	const forceOAuth = Bun.argv.includes("--force-oauth");
	if (!appDatabaseUrl()) {
		throw new Error("Set APP_DATABASE_URL or GBRAIN_DATABASE_URL in .env");
	}

	console.log("Registering shared gbrain source...");
	await ensureGitRepo("shared-source");
	runGbrainAllowExists([
		"sources",
		"add",
		SHARED_SOURCE_ID,
		"--path",
		"./shared-source",
		"--federated",
	]);

	console.log("Syncing shared-source...");
	try {
		runGbrain(["sync", "--source", SHARED_SOURCE_ID]);
	} catch (err) {
		console.warn(
			"Sync warning (non-fatal):",
			err instanceof Error ? err.message : err,
		);
	}

	await migrate();

	console.log("Registering shared OAuth client for think...");
	const oauth = await ensureSharedOAuth(forceOAuth);
	await upsertGbrainAuth({
		oauth_client_id: oauth.clientId,
		oauth_client_secret: oauth.clientSecret,
	});
	console.log(`  oauth_client_id=${oauth.clientId}`);

	for (const [id, apiKey] of Object.entries(DEMO_API_KEYS)) {
		await upsertUser({ id, api_key: apiKey });
		console.log(`  demo user ${id}: api_key=${apiKey}`);
	}

	console.log("\nSetup complete.");
	console.log("Start gbrain: gbrain serve --http --port 3131");
	console.log("Start API:    bun run dev:api");
	await closeDb();
}

await main();
