#!/bin/sh

git push origin
git push origin v$1
gh release create v$1 --verify-tag --title "Release $1" --notes ""

gh workflow run deploy.yaml --ref v$1
