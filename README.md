# Codes

Codes is a project for converting medical dictations into billing codes.

## Sample data

[`data/hand-surgery-dictations.json`](data/hand-surgery-dictations.json)
contains ten synthetic hand-surgery operative dictations with candidate
ICD-10-CM and CPT codes. See [`data/README.md`](data/README.md) for the schema,
provenance, and important coding limitations.

## Status

This project is in early development. Setup and usage instructions will be added
as the implementation takes shape.

## Development

Use Node.js 24 or newer and npm:

```sh
npm ci
npm run check
```

`npm run check` enforces Oxfmt formatting, all Oxlint rule categories,
type-aware linting, strict TypeScript checks, and tests. Unit tests use only
Node's built-in `node:test` and `node:assert/strict` modules.

## License

This project is licensed under the [MIT License](LICENSE).
