import {type ExecutionResult, type Sandbox, SandboxClient} from "agentic-sandbox-client";

const WARMPOOL = process.env.WARMPOOL ?? "sandboxd-warmpool";
const NAMESPACE = process.env.NAMESPACE ?? "default";

function assertCommandSucceeded(label: string, result: ExecutionResult): void {
  console.log(`${label} stdout:`, result.stdout.trim());
  console.log(`${label} stderr:`, result.stderr.trim());
  console.log(`${label} exitCode:`, result.exitCode);

  if (result.exitCode !== 0) {
    throw new Error(
      `${label} failed with exit code ${result.exitCode}\n` +
        `stdout:\n${result.stdout}\n` +
        `stderr:\n${result.stderr}`,
    );
  }
}

async function main() {
  // Inside the cluster, dial the Sandbox's headless Service directly instead
  // of port-forwarding through the apiserver. This requires `service: true`
  // on the SandboxTemplate and a NetworkPolicy ingress rule admitting this
  // Pod (see manifests/sandbox-template-and-pool.yaml).
  const client = new SandboxClient({
    namespace: NAMESPACE,
    sandboxd: { connectivity: "in-cluster-service" },
  });
  const stopAutoCleanup = client.enableAutoCleanup();
  let sandbox: Sandbox | undefined;
  let primaryError: unknown;

  try {
    console.log(`Creating sandbox from warmpool: ${WARMPOOL}`);
    sandbox = await client.createSandbox(WARMPOOL, NAMESPACE);
    console.log(`Sandbox created: ${sandbox.claimName}`);
    console.log(`Connecting to sandboxd: ${sandbox.serviceFQDN}`);

    // commands.run() takes an argv; no shell is involved unless you invoke one.
    const r1 = await sandbox.commands.run("echo", ["Hello from Sandbox!"]);
    assertCommandSucceeded("echo", r1);

    const r2 = await sandbox.commands.run("uname", ["-a"]);
    assertCommandSucceeded("uname", r2);

    const r3 = await sandbox.commands.run("sh", ["-c", "echo $((6 * 7))"]);
    assertCommandSucceeded("sh", r3);

    await client.deleteSandbox(sandbox.claimName, sandbox.namespace);
    console.log("Sandbox deleted.");
    sandbox = undefined;
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    try {
      await sandbox?.close();
    } catch (cleanupErr) {
      console.error("Sandbox cleanup failed:", cleanupErr);
      if (primaryError === undefined) {
        throw cleanupErr;
      }
    } finally {
      stopAutoCleanup();
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
