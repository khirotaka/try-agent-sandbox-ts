import { SandboxClient } from "agentic-sandbox-client";

const SANDBOX_ROUTER_URL =
  process.env.SANDBOX_ROUTER_URL ??
  "http://sandbox-router-svc.default.svc.cluster.local:8080";
const WARMPOOL = process.env.WARMPOOL ?? "python-sandbox-warmpool";
const NAMESPACE = process.env.NAMESPACE ?? "default";

async function main() {
  console.log(`Connecting to router: ${SANDBOX_ROUTER_URL}`);
  const client = new SandboxClient({ apiUrl: SANDBOX_ROUTER_URL });

  console.log(`Creating sandbox from warmpool: ${WARMPOOL}`);
  const sandbox = await client.createSandbox(WARMPOOL, NAMESPACE);
  console.log(`Sandbox created: ${sandbox.claimName}`);

  try {
    const r1 = await sandbox.commands.run('echo "Hello from Sandbox!"');
    console.log("echo:", r1.stdout.trim());

    const r2 = await sandbox.commands.run("uname -a");
    console.log("uname:", r2.stdout.trim());

    const r3 = await sandbox.commands.run('python3 -c "print(6 * 7)"');
    console.log("python:", r3.stdout.trim());
  } finally {
    await client.deleteSandbox(sandbox.claimName, NAMESPACE);
    console.log("Sandbox deleted.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
