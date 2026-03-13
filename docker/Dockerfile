FROM node:20-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates unzip jq \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Copy PAI-DOTS scaffolding into the image
COPY .claude/ /root/.claude/

# Agent runner + orchestrator
COPY docker/agent-runner.ts /opt/agent-runner.ts
COPY docker/orchestrator.ts /opt/orchestrator.ts

WORKDIR /workspace

ENTRYPOINT ["bun", "/opt/agent-runner.ts"]
