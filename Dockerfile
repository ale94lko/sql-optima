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

# `npm run build` bundles with ncc and copies sql-wasm.js + sql-wasm.wasm next to
# dist/ (see scripts/copy-sqljs-wasm.js). SqliteAnalyzer loads those assets at runtime.
RUN npm run build

# Runtime: ncc bundle + sql.js wasm assets + fixtures. SQLite smoke needs no extra DB.
FROM node:24-alpine

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY examples ./examples

# @actions/core maps action.yml inputs to INPUT_* (uppercase, underscores).
# Defaults make `docker run --rm sql-optima` a self-contained sqlite smoke.
# Step Summary goes to stdout so the markdown report is printed. GITHUB_OUTPUT
# must be an existing file (@actions/core v2 throws if the path is missing).
ENV INPUT_ENGINE=sqlite \
    INPUT_SQL_FILE=examples/mixed_sqlite.sql \
    GITHUB_STEP_SUMMARY=/dev/stdout \
    GITHUB_OUTPUT=/tmp/github-output

RUN touch /tmp/github-output && chmod 666 /tmp/github-output

USER node

ENTRYPOINT ["node", "dist/index.js"]
