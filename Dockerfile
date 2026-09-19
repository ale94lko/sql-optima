# Self-contained image for the GitHub Action (`node dist/index.js`).
# Optional local Postgres remains in docker-compose.yml — this file is not Compose.
#
# Build:  docker build -t sql-optima .
# Smoke:  docker run --rm sql-optima
#         docker run --rm -e INPUT_ENGINE=sqlite -e INPUT_SQL_FILE=examples/mixed_sqlite.sql sql-optima

FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src
COPY scripts ./scripts
RUN npm run build

# Runtime: ncc bundle + sql.js wasm + fixtures. SQLite smoke needs no extra DB service.
FROM node:24-alpine

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY examples ./examples

# @actions/core maps action.yml inputs to INPUT_* (uppercase, underscores).
# Defaults make `docker run --rm sql-optima` a self-contained sqlite smoke.
# Step Summary / outputs are written to these paths; stdout prints the markdown report.
ENV INPUT_ENGINE=sqlite \
    INPUT_SQL_FILE=examples/mixed_sqlite.sql \
    GITHUB_STEP_SUMMARY=/dev/stdout \
    GITHUB_OUTPUT=/tmp/github-output

USER node

ENTRYPOINT ["node", "dist/index.js"]
