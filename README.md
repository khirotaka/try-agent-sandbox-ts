# try-agent-sandbox-ts

A demonstration repository for the TypeScript client in [khirotaka/agent-sandbox](https://github.com/khirotaka/agent-sandbox) — a fork of [kubernetes-sigs/agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox) that adds a TypeScript client (`agentic-sandbox-client`).

The goal is to provide a minimal, runnable setup so you can quickly verify that the TypeScript client works end-to-end.

`khirotaka/agent-sandbox` is managed as a Git submodule under `agent-sandbox/`.

https://github.com/user-attachments/assets/8ad9504f-95ce-4b15-a15b-e55f1c9ab5b9

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
2. Installs the agent-sandbox controller (v0.5.0)
3. Builds and loads the `sandbox-router` and `python-runtime-sandbox` Docker images
4. Applies the sandbox template and pool manifests

### 4a. Run the playground demo

```bash
task playground:run
```

The playground ([playground/index.ts](playground/index.ts)) creates a sandbox, runs a command, reads/writes a file, and lists active sandboxes — exercising the core TypeScript client API.

### 4b. Run the k8s Job demo

```bash
task job:run
```

This builds a Docker image from [sandbox-job/](sandbox-job/), loads it into kind, and deploys a Kubernetes Job that:

1. Connects to the sandbox router via cluster-internal DNS (**Advanced Mode**)
2. Creates a sandbox from `python-sandbox-warmpool`
3. Runs three simple commands inside the sandbox (`echo`, `uname -a`, `python3`)
4. Deletes the sandbox and exits

Expected output from `kubectl logs job/sandbox-job`:

```
Connecting to router: http://sandbox-router-svc.default.svc.cluster.local:8080
Creating sandbox from warmpool: python-sandbox-warmpool
Sandbox created: <claim-name>
echo: Hello from Sandbox!
uname: Linux ...
python: 42
Sandbox deleted.
```

## Teardown

```bash
task cluster:delete
```

## Repository structure

```
.
├── agent-sandbox/      # Submodule — khirotaka/agent-sandbox (fork of kubernetes-sigs/agent-sandbox)
│   └── clients/typescript/agentic-sandbox-client/   # TypeScript client source
├── manifests/          # Kubernetes manifests for sandbox-router and sandbox pool
├── playground/         # Interactive demo — runs locally via tsx (Dev Mode / port-forward)
├── sandbox-job/        # Kubernetes Job demo — runs inside the cluster (Advanced Mode)
│   ├── src/main.ts     # Job entrypoint: creates sandbox, runs commands, cleans up
│   ├── Dockerfile      # Build context: project root
│   └── k8s/job.yaml    # ServiceAccount + RBAC + Job manifest
├── kind-config.yaml    # kind cluster configuration
├── Taskfile.yaml       # Task runner definitions
└── mise.toml           # Tool version pins
```
