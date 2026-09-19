# Codes

Codes is a project for converting medical dictations into billing codes.

## Usage

Set `TYPESAFE_API_KEY`, then provide a dictation as a file or through stdin. The
CLI evaluates it against the packaged internal billing-code catalog.

```sh
pnpm start --input dictation.txt
cat dictation.txt | pnpm start
```

## Sample data

[`data/hand-surgery-dictations.json`](data/hand-surgery-dictations.json)
contains ten synthetic hand-surgery operative dictations with candidate
ICD-10-CM and CPT codes. See [`data/README.md`](data/README.md) for the schema,
provenance, and important coding limitations.

## Status

This project is in early development. Setup and usage instructions will be added
as the implementation takes shape.

## Development

Use Node.js 24 or newer and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` enforces Oxfmt formatting, all Oxlint rule categories, type-aware
linting, strict TypeScript checks, and tests. Unit tests use only Node's
built-in `node:test` and `node:assert/strict` modules.

## License

This project is licensed under the [MIT License](LICENSE).
