import { SandboxClient } from "agentic-sandbox-client";

const client = new SandboxClient({
    namespace: "default",
    quiet: true,
});
const sandbox = await client.createSandbox("sandboxd-inject-warmpool");

try {
    const result = await sandbox.commands.run("python", ["--version"]);
    console.log(result.stdout);

    await sandbox.files.write("./hello.py", `
def main():
    print("Hello, from sandbox")

if __name__ == "__main__":
    main()
`);
    const helloResult = await sandbox.commands.run("python", ["./hello.py"]);
    console.log(helloResult.stdout);

    const numpyInstall = await sandbox.commands.run("sh", ["-c", "pip install numpy"]);
    console.log(`exit code: ${numpyInstall.exitCode}`);
    await sandbox.files.write("./call_numpy.py", `
import numpy as np
def main():
    a = np.arange(0, 10, 1)
    print(a)

if __name__ == "__main__":
    main()
`);
    const callNumpyResult = await sandbox.commands.run("python", ["./call_numpy.py"]);
    console.log(callNumpyResult.stdout);

} finally {
    await sandbox.close();
}
