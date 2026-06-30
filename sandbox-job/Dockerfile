# Build context: project root (..)
# Run: docker build -t sandbox-job:latest -f sandbox-job/Dockerfile .

FROM node:22-alpine

# Copy SDK maintaining the same relative path structure so that
# the "file:../agent-sandbox/..." reference in package.json resolves correctly.
WORKDIR /workspace/agent-sandbox/clients/typescript/agentic-sandbox-client
COPY agent-sandbox/clients/typescript/agentic-sandbox-client/ .
RUN npm install

# Install job dependencies (resolves file: reference to the SDK above)
WORKDIR /workspace/sandbox-job
COPY sandbox-job/package.json sandbox-job/package-lock.json ./
RUN npm install

# Copy source
COPY sandbox-job/src/ ./src/
COPY sandbox-job/tsconfig.json ./

CMD ["node_modules/.bin/tsx", "src/main.ts"]
