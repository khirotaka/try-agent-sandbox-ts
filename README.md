# try-agent-sandbox-ts

A demonstration repository for the TypeScript client in [khirotaka/agent-sandbox](https://github.com/khirotaka/agent-sandbox) — a fork of [kubernetes-sigs/agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox) that adds a TypeScript client (`agentic-sandbox-client`).

The goal is to provide a minimal, runnable setup so you can quickly verify that the TypeScript client works end-to-end.

The client talks to [sandboxd](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/packages/sandboxd/USER_GUIDE.md), the in-sandbox runtime daemon: files over REST (`:8080`) and commands over gRPC (`:9090`).

`khirotaka/agent-sandbox` is managed as a Git submodule under `agent-sandbox/`.

https://github.com/user-attachments/assets/8ad9504f-95ce-4b15-a15b-e55f1c9ab5b9

An unofficial, diagram-heavy explainer (日本語 / English) of the four CRDs, sandboxd, and the TypeScript SDK internals is published with GitHub Pages from [docs/](docs/): <https://khirotaka.github.io/try-agent-sandbox-ts/>

## Prerequisites

| Tool | Version |
|------|---------|
| [mise](https://mise.jdx.dev/) | latest |
| [Docker](https://docs.docker.com/get-docker/) | latest |

Tooling versions (kind, Node.js, task) are pinned in [mise.toml](mise.toml) and installed automatically by mise.

## Setup

### 1. Clone with submodules

```bash
git clone --recurse-submodules https://github.com/khirotaka/try-agent-sandbox-ts.git
cd try-agent-sandbox-ts
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

### 2. Install tools

```bash
mise trust && mise install
```

### 3. Create the local Kubernetes cluster

```bash
task cluster:create
```

This single command:

1. Creates a [kind](https://kind.sigs.k8s.io/) cluster named `try-agent-sandbox-ts`
2. Installs the agent-sandbox controller with extensions (v1.0.4)
3. Builds the `sandboxd` image from the submodule (so the daemon always matches the TypeScript client) and loads it into kind
4. Applies the `sandboxd-template` SandboxTemplate and `sandboxd-warmpool` SandboxWarmPool ([manifests/sandbox-template-and-pool.yaml](manifests/sandbox-template-and-pool.yaml))
5. Applies the `sandboxd-inject-template` SandboxTemplate and `sandboxd-inject-warmpool` SandboxWarmPool ([manifests/sandbox-template-and-pool-inject.yaml](manifests/sandbox-template-and-pool-inject.yaml)), used by the Python demo (4c)

The `sandboxd-warmpool` sandbox runs sandboxd as its only container, so commands execute inside the sandboxd image (`debian:bookworm-slim` with a shell and coreutils — no language runtimes).

### 4a. Run the playground demo

```bash
task playground:run
```

The playground ([playground/index.ts](playground/index.ts)) runs locally and reaches sandboxd through a pod **port-forward** (the client's default connectivity), so it only needs your kubeconfig. It creates a sandbox and exercises the core TypeScript client API:

- `sandbox.health()` / `sandbox.metadata()`
- `sandbox.commands.run()` — argv-style execution, `env` / `cwd`, non-zero exit codes, and a missing executable
- `sandbox.files.*` — write / read / exists / list / delete, binary content, file modes, streaming, and client-side path confinement
- `SandboxClient` — `listActiveSandboxes`, `listAllSandboxes` (label selector), `getSandboxClaimWarmpoolName`, `getSandbox`, `deleteSandbox`

### 4b. Run the k8s Job demo

```bash
task job:run
```

This builds a Docker image from [sandbox-job/](sandbox-job/), loads it into kind, and deploys a Kubernetes Job that:

1. Creates a sandbox from `sandboxd-warmpool`
2. Connects to sandboxd directly over the pod network via the Sandbox's headless Service (`connectivity: "in-cluster-service"`)
3. Runs three simple commands inside the sandbox (`echo`, `uname -a`, `sh -c 'echo $((6 * 7))'`)
4. Deletes the sandbox and exits

In-cluster access requires `service: true` on the SandboxTemplate and a NetworkPolicy ingress rule that admits the caller. The template's `networkPolicy` allows TCP 8080/9090 only from pods labeled `app: sandbox-job`, which the Job's pod template sets.

Expected output from `kubectl logs job/sandbox-job`:

```
Creating sandbox from warmpool: sandboxd-warmpool
Sandbox created: <claim-name>
Connecting to sandboxd: <sandbox-name>.default.svc.cluster.local
echo stdout: Hello from Sandbox!
uname stdout: Linux ...
sh stdout: 42
Sandbox deleted.
```

(stderr/exitCode lines and the client's `[agentic-sandbox-client]` log lines are omitted above.)

### 4c. Run the Python demo (sandboxd injected into a Python image)

```bash
task python-sandbox:run
```

The default sandbox has no language runtimes, because commands run inside the sandboxd image. [manifests/sandbox-template-and-pool-inject.yaml](manifests/sandbox-template-and-pool-inject.yaml) instead injects sandboxd into an unmodified `python:3.14-slim` image: an initContainer copies the sandboxd binary into a shared `emptyDir`, and the python container runs it as its command. Commands then execute inside the python image, so `python` and `pip` are available without rebuilding any image. This follows `examples/sandboxd-sandbox/deploy/b-inject-binary.yaml` in the submodule.

The demo ([python-sandbox/main.ts](python-sandbox/main.ts)) claims a sandbox from `sandboxd-inject-warmpool` over port-forward, then:

1. Prints `python --version`
2. Writes `hello.py` with `sandbox.files.write()` and runs it
3. Runs `pip install numpy` (a user install under `HOME=/workspace`, since the container runs as uid 1000)
4. Writes and runs a script that imports numpy

The template sets `dnsPolicy: None` with public resolvers: a custom `networkPolicy` replaces the controller's defaults, and its egress rule would otherwise block kube-dns and make `pip install` hang.

A walkthrough is on the docs site: [日本語](https://khirotaka.github.io/try-agent-sandbox-ts/python-inject/) / [English](https://khirotaka.github.io/try-agent-sandbox-ts/en/python-inject/).

## Teardown

```bash
task cluster:delete
```

## Repository structure

```
.
├── agent-sandbox/      # Submodule — khirotaka/agent-sandbox (fork of kubernetes-sigs/agent-sandbox)
│   ├── clients/typescript/agentic-sandbox-client/   # TypeScript client source
│   └── packages/sandboxd/                           # sandboxd runtime daemon (image built from here)
├── docs/               # GitHub Pages explainer (ja: docs/index.html, en: docs/en/index.html; Python demo: docs/python-inject/)
├── manifests/          # SandboxTemplate + SandboxWarmPool: sandboxd only, and sandboxd injected into python:3.14-slim
├── playground/         # Interactive demo — runs locally via tsx (port-forward connectivity)
├── python-sandbox/     # Python demo — runs python / pip in the injected sandbox (port-forward connectivity)
├── sandbox-job/        # Kubernetes Job demo — runs inside the cluster (in-cluster-service connectivity)
│   ├── src/main.ts     # Job entrypoint: creates sandbox, runs commands, cleans up
│   ├── Dockerfile      # Build context: project root
│   └── k8s/job.yaml    # ServiceAccount + RBAC + Job manifest
├── kind-config.yaml    # kind cluster configuration
├── Taskfile.yaml       # Task runner definitions
└── mise.toml           # Tool version pins
```
