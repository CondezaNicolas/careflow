FROM node:20-alpine

WORKDIR /app

# Copy root config files first
COPY tsconfig.base.json ./
COPY package.json package-lock.json* ./
COPY packages/*/package.json ./packages/
COPY apps/worker/package.json ./apps/worker/

# Install root dependencies
RUN npm install

# Copy source
COPY apps/worker ./apps/worker
COPY packages/shared-types ./packages/shared-types

# Build shared types
RUN npm run build -w packages/shared-types

CMD ["npm", "run", "start", "-w", "@lia/worker"]
