FROM node:22-alpine AS dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

FROM dependencies AS build

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM dependencies AS migrate

CMD ["npx", "prisma", "migrate", "deploy"]

FROM dependencies AS seed

COPY tsconfig.json ./
COPY src ./src
CMD ["npm", "run", "db:seed"]

FROM dependencies AS keycloak-setup

COPY scripts ./scripts
CMD ["npm", "run", "setup:keycloak"]

FROM dependencies AS api-tests

COPY scripts ./scripts
COPY api-tests ./api-tests
CMD ["npm", "run", "test:api"]

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci --omit=dev
COPY --from=dependencies /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["npm", "start"]
