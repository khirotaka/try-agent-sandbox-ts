import {type ExecutionResult, type Sandbox, SandboxClient} from "agentic-sandbox-client";

const SANDBOX_ROUTER_URL = process.env.SANDBOX_ROUTER_URL ?? "http://sandbox-router-svc.default.svc.cluster.local:8080";
const WARMPOOL = process.env.WARMPOOL ?? "python-sandbox-warmpool";
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
  console.log(`Connecting to router: ${SANDBOX_ROUTER_URL}`);
  const client = new SandboxClient({ apiUrl: SANDBOX_ROUTER_URL });
  const stopAutoCleanup = client.enableAutoCleanup();
  let sandbox: Sandbox | undefined;
  let primaryError: unknown;

  try {
    console.log(`Creating sandbox from warmpool: ${WARMPOOL}`);
    sandbox = await client.createSandbox(WARMPOOL, NAMESPACE);
    console.log(`Sandbox created: ${sandbox.claimName}`);

    const r1 = await sandbox.commands.run('echo "Hello from Sandbox!"');
    assertCommandSucceeded("echo", r1);

    const r2 = await sandbox.commands.run("uname -a");
    assertCommandSucceeded("uname", r2);

    const r3 = await sandbox.commands.run('python3 -c "print(6 * 7)"');
    assertCommandSucceeded("python", r3);

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
