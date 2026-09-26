import {
	type DirectoryListing,
	type Sandbox,
	SandboxClient,
	SandboxdRpcError,
	SandboxError,
} from "agentic-sandbox-client";

const WARMPOOL_NAME = "sandboxd-warmpool";
const NAMESPACE = "default";
const CALL_TIMEOUT_MS = 10_000;
const COVERAGE_LABEL = "playground.agent-sandbox/coverage";

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(`Assertion failed: ${message}`);
	}
}

const decoder = new TextDecoder();

function bytesToString(content: Uint8Array): string {
	return decoder.decode(content);
}

function printListing(listing: DirectoryListing): void {
	for (const entry of listing.entries) {
		console.log(
			"  ",
			entry.name,
			entry.type,
			entry.size,
			"bytes",
			entry.mode ?? "",
			entry.modifiedAt,
		);
	}
}

async function expectRejection(
	label: string,
	action: () => Promise<unknown>,
	check: (err: unknown) => boolean,
): Promise<void> {
	try {
		await action();
	} catch (err) {
		assert(check(err), `${label}: unexpected error ${err}`);
		console.log(`${label} rejected:`, (err as Error).message);
		return;
	}
	throw new Error(`${label} unexpectedly succeeded`);
}

async function demonstrateRuntime(sandbox: Sandbox): Promise<void> {
	console.log("\n--- Runtime ---");
	const health = await sandbox.health({ timeoutMs: CALL_TIMEOUT_MS });
	console.log("health:", health.status, `(uptime ${health.uptimeSeconds}s)`);
	assert(health.status === "ok", "sandboxd should be healthy");

	// Only SANDBOX_-prefixed, non-credential variables are exposed; the
	// template sets SANDBOX_EXAMPLE on the sandboxd container.
	const { env } = await sandbox.metadata({ timeoutMs: CALL_TIMEOUT_MS });
	console.log("metadata env:", env);
	assert(
		env.SANDBOX_EXAMPLE === "try-agent-sandbox-ts",
		"metadata should expose SANDBOX_EXAMPLE",
	);
}

async function demonstrateCommands(sandbox: Sandbox): Promise<void> {
	console.log("\n--- Commands ---");
	// commands.run() takes an argv. No shell is involved, so the argument is
	// passed through verbatim (no word splitting or globbing).
	const result = await sandbox.commands.run("echo", ["Hello, World!"], {
		timeoutMs: CALL_TIMEOUT_MS,
	});
	console.log("stdout:", result.stdout);
	console.log("stderr:", result.stderr);
	console.log("exitCode:", result.exitCode);
	assert(result.stdout.trim() === "Hello, World!", "echo stdout should match");
	assert(result.stderr === "", "echo stderr should be empty");
	assert(result.exitCode === 0, "echo exit code should be 0");

	// Invoke a shell explicitly for redirects, pipes, `exit`, etc. A non-zero
	// exit code is a normal result, not an error.
	const failed = await sandbox.commands.run(
		"sh",
		["-c", "echo failure >&2; exit 7"],
		{ timeoutMs: CALL_TIMEOUT_MS },
	);
	console.log("failure stdout:", failed.stdout);
	console.log("failure stderr:", failed.stderr);
	console.log("failure exitCode:", failed.exitCode);
	assert(failed.exitCode === 7, "failed command exit code should be returned");
	assert(
		failed.stderr.trim() === "failure",
		"failed command stderr should be returned",
	);

	// env is merged over sandboxd's own environment; cwd is relative to the
	// sandbox root (/workspace) and must already exist.
	await sandbox.files.write("work/.keep", "");
	const withEnv = await sandbox.commands.run(
		"sh",
		["-c", 'echo "$GREETING from $(pwd)"'],
		{ env: { GREETING: "Hi" }, cwd: "work", timeoutMs: CALL_TIMEOUT_MS },
	);
	console.log("env/cwd stdout:", withEnv.stdout.trim());
	assert(
		withEnv.stdout.trim() === "Hi from /workspace/work",
		"env and cwd should be applied",
	);

	// Without a shell, a missing executable is an RPC error, not exit code 127.
	await expectRejection(
		"missing executable",
		() =>
			sandbox.commands.run("no-such-command", {
				timeoutMs: CALL_TIMEOUT_MS,
			}),
		(err) => err instanceof SandboxdRpcError && err.code === "not_found",
	);
}

async function demonstrateFiles(sandbox: Sandbox): Promise<void> {
	console.log("\n--- Files (root) ---");
	await sandbox.files.write("hello.txt", "Hello, Agent Sandbox!", {
		timeoutMs: CALL_TIMEOUT_MS,
	});

	const content = await sandbox.files.read("hello.txt", {
		timeoutMs: CALL_TIMEOUT_MS,
	});
	console.log("content:", bytesToString(content));
	assert(
		bytesToString(content) === "Hello, Agent Sandbox!",
		"text file content should match",
	);

	// Files written over REST are visible to commands run over gRPC.
	const cat = await sandbox.commands.run("cat", ["hello.txt"]);
	assert(
		cat.stdout === "Hello, Agent Sandbox!",
		"commands should see files written through the files API",
	);

	const helloExists = await sandbox.files.exists("hello.txt", {
		timeoutMs: CALL_TIMEOUT_MS,
	});
	console.log("exists:", helloExists);
	assert(helloExists, "hello.txt should exist");

	const missingExists = await sandbox.files.exists("missing.txt", {
		timeoutMs: CALL_TIMEOUT_MS,
	});
	console.log("missing exists:", missingExists);
	assert(!missingExists, "missing.txt should not exist");

	printListing(await sandbox.files.list(".", { timeoutMs: CALL_TIMEOUT_MS }));

	console.log("\n--- Files (subdirectory) ---");
	// write() creates parent directories as needed.
	await sandbox.files.write("docs/file.txt", "sample text", {
		timeoutMs: CALL_TIMEOUT_MS,
	});

	const content2 = await sandbox.files.read("docs/file.txt", {
		timeoutMs: CALL_TIMEOUT_MS,
	});
	console.log("content:", bytesToString(content2));
	assert(
		bytesToString(content2) === "sample text",
		"subdirectory file should match",
	);

	const binaryContent = new Uint8Array([0, 1, 2, 3, 255]);
	await sandbox.files.write("docs/binary.bin", binaryContent, {
		mode: "0600",
		timeoutMs: CALL_TIMEOUT_MS,
	});
	const binaryRead = await sandbox.files.read("docs/binary.bin", {
		timeoutMs: CALL_TIMEOUT_MS,
	});
	assert(
		Buffer.compare(binaryRead, binaryContent) === 0,
		"binary file content should match",
	);

	const specialPath = "docs/file with spaces & symbols!.txt";
	await sandbox.files.write(specialPath, "special path", {
		timeoutMs: CALL_TIMEOUT_MS,
	});
	const specialContent = await sandbox.files.read(specialPath, {
		timeoutMs: CALL_TIMEOUT_MS,
	});
	assert(
		bytesToString(specialContent) === "special path",
		"special path file content should match",
	);

	const docsListing = await sandbox.files.list("docs", {
		timeoutMs: CALL_TIMEOUT_MS,
	});
	printListing(docsListing);
	assert(
		docsListing.entries.some(
			(entry) => entry.name === "file with spaces & symbols!.txt",
		),
		"special path file should be listed",
	);
	assert(
		docsListing.entries.find((entry) => entry.name === "binary.bin")?.mode ===
			"0600",
		"write mode should be applied",
	);

	console.log("\n--- Files (streaming) ---");
	const streamed = new ReadableStream<Uint8Array>({
		start(controller) {
			for (let i = 1; i <= 3; i++) {
				controller.enqueue(new TextEncoder().encode(`chunk ${i}\n`));
			}
			controller.close();
		},
	});
	await sandbox.files.writeStream("docs/stream.txt", streamed, {
		timeoutMs: CALL_TIMEOUT_MS,
	});
	const stream = await sandbox.files.readStream("docs/stream.txt", {
		timeoutMs: CALL_TIMEOUT_MS,
	});
	// A readStream() must be consumed to completion (or cancelled).
	const streamedText = await new Response(stream).text();
	console.log("streamed:", JSON.stringify(streamedText));
	assert(
		streamedText === "chunk 1\nchunk 2\nchunk 3\n",
		"streamed content should round-trip",
	);

	console.log("\n--- Files (delete) ---");
	await expectRejection(
		"non-recursive delete of non-empty directory",
		() => sandbox.files.delete("docs", { timeoutMs: CALL_TIMEOUT_MS }),
		(err) => err instanceof SandboxError,
	);
	await sandbox.files.delete("docs", {
		recursive: true,
		timeoutMs: CALL_TIMEOUT_MS,
	});
	assert(
		!(await sandbox.files.exists("docs")),
		"docs should be deleted recursively",
	);
	console.log("docs deleted recursively");

	console.log("\n--- Path confinement ---");
	// Paths are validated client-side before any request is sent.
	await expectRejection(
		"parent segment",
		() => sandbox.files.write("../escape.txt", "unsafe"),
		(err) => err instanceof SandboxError && err.message.includes("'..'"),
	);
	await expectRejection(
		"absolute path",
		() => sandbox.files.read("/etc/passwd"),
		(err) =>
			err instanceof SandboxError &&
			err.message.includes("absolute paths are not allowed"),
	);
}

async function demonstrateClientOperations(
	client: SandboxClient,
	sandbox: Sandbox,
): Promise<void> {
	console.log("\n--- Active sandboxes ---");
	const activeSandboxes = client.listActiveSandboxes();
	for (const s of activeSandboxes) {
		console.log(" ", s.claimName, s.namespace);
	}
	assert(
		activeSandboxes.some(
			(s) =>
				s.claimName === sandbox.claimName && s.namespace === sandbox.namespace,
		),
		"created sandbox should be active",
	);

	console.log("\n--- All sandboxes (label selector) ---");
	const allSandboxes = await client.listAllSandboxes(
		sandbox.namespace,
		`${COVERAGE_LABEL}=typescript`,
	);
	for (const claimName of allSandboxes) {
		console.log(" ", claimName);
	}
	assert(
		allSandboxes.includes(sandbox.claimName),
		"created sandbox should be in listAllSandboxes",
	);

	console.log("\n--- Sandbox claim WarmPool ---");
	const warmPoolName = await client.getSandboxClaimWarmpoolName(
		sandbox.claimName,
		sandbox.namespace,
	);
	console.log("warmPool:", warmPoolName);
	assert(warmPoolName === WARMPOOL_NAME, "WarmPool name should match");

	console.log("\n--- getSandbox ---");
	const retrieved = await client.getSandbox(
		sandbox.claimName,
		sandbox.namespace,
	);
	const result = await retrieved.commands.run("echo", ["Hello again!"]);
	console.log("stdout:", result.stdout);
	assert(
		result.stdout.trim() === "Hello again!",
		"retrieved sandbox should run commands",
	);
}

async function main() {
	// The default "port-forward" connectivity reaches sandboxd through the
	// apiserver, so this works from a laptop with just a kubeconfig.
	const client = new SandboxClient({ namespace: NAMESPACE });
	const stopAutoCleanup = client.enableAutoCleanup();
	let sandbox: Sandbox | undefined;

	try {
		sandbox = await client.createSandbox(WARMPOOL_NAME, NAMESPACE, {
			labels: { [COVERAGE_LABEL]: "typescript" },
			sandboxReadyTimeout: 180,
			// Fallback: the controller deletes the claim even if this process
			// dies before cleaning up.
			shutdownAfterSeconds: 600,
		});
		console.log(
			"Sandbox created:",
			sandbox.sandboxName,
			sandbox.namespace,
			sandbox.podName,
			sandbox.claimName,
		);

		await demonstrateRuntime(sandbox);
		await demonstrateCommands(sandbox);
		await demonstrateFiles(sandbox);
		await demonstrateClientOperations(client, sandbox);

		console.log("\n--- deleteSandbox ---");
		await client.deleteSandbox(sandbox.claimName, sandbox.namespace);
		console.log("Sandbox deleted:", sandbox.claimName);
		sandbox = undefined;
	} catch (err) {
		console.error("Error:", err);
		process.exitCode = 1;
	} finally {
		try {
			await sandbox?.close();
		} finally {
			stopAutoCleanup();
		}
	}
}

main();
