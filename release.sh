#!/usr/bin/env bash

rm -rf out *.vsix dist
mkdir -p dist
npm run lint
npm run buildExplorer
npm run package
rm -rf out

