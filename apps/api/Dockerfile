FROM node:20-alpine

WORKDIR /app

# Copy root config files first
COPY tsconfig.base.json ./
COPY package.json package-lock.json* ./
COPY packages/*/package.json ./packages/
COPY apps/api/package.json ./apps/api/

# Install root dependencies
RUN npm install

# Copy source
COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types

# Build shared types
RUN npm run build -w packages/shared-types

EXPOSE 3311

CMD ["npm", "run", "dev", "-w", "@lia/api"]
