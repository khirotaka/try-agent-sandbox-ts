import { type Sandbox, SandboxClient } from "agentic-sandbox-client";

async function demonstrateCommands(sandbox: Sandbox): Promise<void> {
	console.log("\n--- Commands ---");
	const result = await sandbox.commands.run("echo Hello, World!");
	console.log("stdout:", result.stdout);
	console.log("stderr:", result.stderr);
	console.log("exitCode:", result.exitCode);
}

async function demonstrateFiles(sandbox: Sandbox): Promise<void> {
	console.log("\n--- Files (root) ---");
	await sandbox.files.write("hello.txt", "Hello, Agent Sandbox!");

	const content = await sandbox.files.read("hello.txt");
	console.log("content:", String.fromCharCode(...content));
	console.log("exists:", await sandbox.files.exists("hello.txt"));

	for (const file of await sandbox.files.list(".")) {
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
	await sandbox.files.write("./docs/file.txt", "sample text");

	const content2 = await sandbox.files.read("./docs/file.txt");
	console.log("content:", String.fromCharCode(...content2));

	for (const file of await sandbox.files.list("./docs")) {
		console.log(
			"  ",
			file.name,
			file.type,
			file.size,
			"bytes",
			new Date(file.modTime * 1000).toISOString(),
		);
	}
}

async function demonstrateClientOperations(
	client: SandboxClient,
	sandbox: Sandbox,
): Promise<void> {
	console.log("\n--- Active sandboxes ---");
	for await (const s of client.listActiveSandboxes()) {
		console.log(" ", s.claimName, s.namespace);
	}

	console.log("\n--- getSandbox ---");
	const retrieved = await client.getSandbox(
		sandbox.claimName,
		sandbox.namespace,
	);
	const result = await retrieved.commands.run("echo Hello again!");
	console.log("stdout:", result.stdout);
}

async function main() {
	const client = new SandboxClient({ routerNamespace: "default" });
	const stopAutoCleanup = client.enableAutoCleanup();
	let sandbox: Sandbox | undefined;

	try {
		sandbox = await client.createSandbox("python-sandbox-warmpool", "default");
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
	} catch (err) {
		console.error("Error:", err);
	} finally {
		try {
			await sandbox?.close();
		} finally {
			stopAutoCleanup();
		}
	}
}

main();
