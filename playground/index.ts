import { type Sandbox, SandboxClient } from "agentic-sandbox-client";

async function main() {
	const client = new SandboxClient({});
	const stopAutoCleanup = client.enableAutoCleanup();
	let sandbox: Sandbox | undefined;

	try {
		sandbox = await client.createSandbox("python-runtime-template", "default");
		console.log(
			"Sandbox created:",
			sandbox.sandboxName,
			sandbox.namespace,
			sandbox.podName,
			sandbox.claimName,
		);

		const result = await sandbox.commands.run("echo Hello, World!");
		console.log("Command stdout:", result.stdout);
		console.log("Command stderr:", result.stderr);
		console.log("Command exit code:", result.exitCode);

		await sandbox.files.write("hello.txt", "Hello, Agent Sandbox!");
		const fileContent = await sandbox.files.read("hello.txt");
		console.log("File content:", String.fromCharCode(...fileContent));

		const ok = await sandbox.files.exists("hello.txt");
		console.log("File exists:", ok);

		const fileList = await sandbox.files.list(".");
		for (const file of fileList) {
			const modTime = new Date(file.modTime * 1000);
			console.log(
				"    File:",
				file.name,
				"Size:",
				file.size,
				"Bytes",
				"modTime:",
				modTime,
				"type:",
				file.type,
			);
		}

		for await (const s of client.listActiveSandboxes()) {
			console.log("Active sandbox:", s.claimName, s.namespace);
		}

		const sandbox2 = await client.getSandbox(
			sandbox.claimName,
			sandbox.namespace,
		);
		const result2 = await sandbox2.commands.run("echo Hello again!");
		console.log("Command stdout:", result2.stdout);
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
