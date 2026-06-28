import { type Sandbox, SandboxClient } from "agentic-sandbox-client";

const WARMPOOL_NAME = "python-sandbox-warmpool";
const NAMESPACE = "default";
const CALL_TIMEOUT_SECONDS = 10;

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(`Assertion failed: ${message}`);
	}
}

function bufferToString(content: Buffer): string {
	return content.toString("utf8");
}

async function demonstrateCommands(sandbox: Sandbox): Promise<void> {
	console.log("\n--- Commands ---");
	const result = await sandbox.commands.run("echo Hello, World!", {
		timeout: CALL_TIMEOUT_SECONDS,
	});
	console.log("stdout:", result.stdout);
	console.log("stderr:", result.stderr);
	console.log("exitCode:", result.exitCode);
	assert(result.stdout.trim() === "Hello, World!", "echo stdout should match");
	assert(result.stderr === "", "echo stderr should be empty");
	assert(result.exitCode === 0, "echo exit code should be 0");

	const failed = await sandbox.commands.run(
		"sh -c 'echo failure >&2; exit 7'",
		{ timeout: CALL_TIMEOUT_SECONDS },
	);
	console.log("failure stdout:", failed.stdout);
	console.log("failure stderr:", failed.stderr);
	console.log("failure exitCode:", failed.exitCode);
	assert(failed.exitCode === 7, "failed command exit code should be returned");
	assert(
		failed.stderr.trim() === "failure",
		"failed command stderr should be returned",
	);
}

async function demonstrateFiles(sandbox: Sandbox): Promise<void> {
	console.log("\n--- Files (root) ---");
	await sandbox.files.write("hello.txt", "Hello, Agent Sandbox!", {
		timeout: CALL_TIMEOUT_SECONDS,
	});

	const content = await sandbox.files.read("hello.txt", {
		timeout: CALL_TIMEOUT_SECONDS,
	});
	console.log("content:", bufferToString(content));
	assert(
		bufferToString(content) === "Hello, Agent Sandbox!",
		"text file content should match",
	);

	const helloExists = await sandbox.files.exists("hello.txt", {
		timeout: CALL_TIMEOUT_SECONDS,
	});
	console.log("exists:", helloExists);
	assert(helloExists, "hello.txt should exist");

	const missingExists = await sandbox.files.exists("missing.txt", {
		timeout: CALL_TIMEOUT_SECONDS,
	});
	console.log("missing exists:", missingExists);
	assert(!missingExists, "missing.txt should not exist");

	for (const file of await sandbox.files.list(".", {
		timeout: CALL_TIMEOUT_SECONDS,
	})) {
		console.log(
			"  ",
			file.name,
			file.type,
			file.size,
			"bytes",
			new Date(file.modTime * 1000).toISOString(),
		);
	}

	console.log("\n--- Files (subdirectory) ---");
	await sandbox.commands.run("mkdir -p docs");
	await sandbox.files.write("./docs/file.txt", "sample text", {
		timeout: CALL_TIMEOUT_SECONDS,
	});

	const content2 = await sandbox.files.read("./docs/file.txt", {
		timeout: CALL_TIMEOUT_SECONDS,
	});
	console.log("content:", bufferToString(content2));
	assert(
		bufferToString(content2) === "sample text",
		"subdirectory file should match",
	);

	const binaryContent = Buffer.from([0, 1, 2, 3, 255]);
	await sandbox.files.write("./docs/binary.bin", binaryContent, {
		timeout: CALL_TIMEOUT_SECONDS,
	});
	const binaryRead = await sandbox.files.read("./docs/binary.bin", {
		timeout: CALL_TIMEOUT_SECONDS,
	});
	assert(
		Buffer.compare(binaryRead, binaryContent) === 0,
		"binary file content should match",
	);

	const specialPath = "./docs/file with spaces & symbols!.txt";
	await sandbox.files.write(specialPath, "special path", {
		timeout: CALL_TIMEOUT_SECONDS,
	});
	const specialContent = await sandbox.files.read(specialPath, {
		timeout: CALL_TIMEOUT_SECONDS,
	});
	assert(
		bufferToString(specialContent) === "special path",
		"special path file content should match",
	);

	const docsEntries = await sandbox.files.list("./docs", {
		timeout: CALL_TIMEOUT_SECONDS,
	});
	for (const file of docsEntries) {
		console.log(
			"  ",
			file.name,
			file.type,
			file.size,
			"bytes",
			new Date(file.modTime * 1000).toISOString(),
		);
	}
	assert(
		docsEntries.some((file) => file.name === "file with spaces & symbols!.txt"),
		"special path file should be listed",
	);

	try {
		await sandbox.files.write("../escape.txt", "unsafe");
		throw new Error("unsafe path write unexpectedly succeeded");
	} catch (err) {
		assert(err instanceof Error, "unsafe path error should be an Error");
		assert(
			err.message.includes("escapes the sandbox root"),
			"unsafe path should be rejected by default",
		);
		console.log("unsafe path rejected:", err.message);
	}
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
			(s) => s.claimName === sandbox.claimName && s.namespace === sandbox.namespace,
		),
		"created sandbox should be active",
	);

	console.log("\n--- All sandboxes ---");
	const allSandboxes = await client.listAllSandboxes(sandbox.namespace);
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
	const result = await retrieved.commands.run("echo Hello again!");
	console.log("stdout:", result.stdout);
	assert(
		result.stdout.trim() === "Hello again!",
		"retrieved sandbox should run commands",
	);
}

async function main() {
	const client = new SandboxClient({ routerNamespace: NAMESPACE });
	const stopAutoCleanup = client.enableAutoCleanup();
	let sandbox: Sandbox | undefined;

	try {
		sandbox = await client.createSandbox(WARMPOOL_NAME, NAMESPACE, {
			labels: { "playground.agent-sandbox/coverage": "typescript" },
			sandboxReadyTimeout: 180,
		});
		console.log(
			"Sandbox created:",
			sandbox.sandboxName,
			sandbox.namespace,
			sandbox.podName,
			sandbox.claimName,
		);

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
