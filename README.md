# python-service-template

A containerized Python service. Describe what it does here — one or two
sentences, from the outside in.

> **Fresh from the template?** Work through
> [docs/new-repo-checklist.md](docs/new-repo-checklist.md) first. It covers the
> handful of things GitHub does not copy when you click *Use this template*.

## Run it

CI publishes the image to GHCR, so there's nothing to build:

```bash
docker run -d \
  --name python-service-template \
  -p 8080:8000 \
  -v /mnt/user/appdata/python-service-template/data:/srv/data \
  ghcr.io/wesnicol2/python-service-template:latest
```

Then open `http://<host>:8080/health`. Or use the compose file, which mounts
`./data` and reads `.env`:

```bash
cp .env.example .env      # pick host ports that aren't already taken
docker compose up -d
```

That brings up **two** services: production (`:latest`, `$PROD_PORT`) and test
(`:test`, `$TEST_PORT`, its own `./data-test` volume). For just the one, name
it: `docker compose up -d <service>`. The two environments are described in
[CONTRIBUTING.md](CONTRIBUTING.md).

Mount `/srv/data` somewhere persistent if the service caches anything worth
keeping across restarts.

### Configuration

| Variable    | Required | Default | Purpose                          |
| ----------- | -------- | ------- | -------------------------------- |
| `PROD_PORT` | no       | `8080`  | Host port for the production container |
| `TEST_PORT` | no       | `8081`  | Host port for the test container       |
| `TZ`        | no       | UTC     | Container timezone               |

## Run from source

```bash
pip install -r requirements.txt
python -m app.api --host 0.0.0.0 --port 8000
```

## Test it

Install the development dependencies once:

```bash
pip install -e ".[dev]"
```

After editing Python, let the repository normalize it rather than hand-formatting
for Ruff:

```bash
bash scripts/fix
```

Before every push, run the same verification gate CI runs:

```bash
bash scripts/verify
```

That gate checks Ruff linting and formatting, Python syntax, and the unit tests.
A deployed Test environment is still required for integration verification after
`dev/*` is promoted to `feature/*`; it is not required to get linting and unit
tests green.

## Endpoints

`/health` — returns `{"status": "ok"}`. Everything else is yours to add; see
`ROUTES` in `app/api.py`.

## Project structure

- `app/` — the application. `api.py` is the entrypoint (the `Dockerfile`'s
  `CMD`).
- `tests/` — unit tests.
- `scripts/` — repo-owned local fix and verification commands used by agents
  and CI.
- `docs/` — long-form docs and the new-repo checklist.
- `data/` — runtime state, git-ignored; mount this.

## Docs

- [CONTRIBUTING.md](CONTRIBUTING.md) — environments, branching, CI/CD, hygiene.
- [AGENTS.md](AGENTS.md) — why the code is shaped this way, and which docs an
  assistant may change on its own.
