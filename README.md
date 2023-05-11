# The usage of TypeScript compiler API to build files incrementally

[![Node.js CI](https://github.com/yunabe/tsapi-watch-cache/actions/workflows/run_tests.yml/badge.svg)](https://github.com/yunabe/tsapi-watch-cache/actions/workflows/run_tests.yml)

## Notes

`service-api`: Incremental compilations are slow because "Check time" is not cached.

## References

- https://github.com/TypeStrong/ts-node/issues/754#issuecomment-458618311
- https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
