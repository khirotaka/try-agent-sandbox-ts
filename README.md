# try-agent-sandbox-ts

A demonstration repository for the TypeScript client in [khirotaka/agent-sandbox](https://github.com/khirotaka/agent-sandbox) — a fork of [kubernetes-sigs/agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox) that adds a TypeScript client (`agentic-sandbox-client`).

The goal is to provide a minimal, runnable setup so you can quickly verify that the TypeScript client works end-to-end.

`khirotaka/agent-sandbox` is managed as a Git submodule under `agent-sandbox/`.

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
2. Installs the agent-sandbox controller (v0.4.6)
3. Builds and loads the `sandbox-router` and `python-runtime-sandbox` Docker images
4. Applies the sandbox template and pool manifests

### 4. Run the demo

```bash
task run
```

The playground ([playground/index.ts](playground/index.ts)) creates a sandbox, runs a command, reads/writes a file, and lists active sandboxes — exercising the core TypeScript client API.

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
├── playground/         # Demo TypeScript code using agentic-sandbox-client
├── kind-config.yaml    # kind cluster configuration
├── Taskfile.yaml       # Task runner definitions
└── mise.toml           # Tool version pins
```
