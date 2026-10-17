#!/usr/bin/env sh
# Vercel build: deploy the Convex functions first, then build SvelteKit with
# PUBLIC_CONVEX_URL pointing at that deployment (set by `convex deploy --cmd`).
# Without a deploy key (e.g. a preview with no Convex preview key) we just build,
# which requires PUBLIC_CONVEX_URL to be set in the Vercel environment.
set -e
if [ -n "$CONVEX_DEPLOY_KEY" ]; then
	npx convex deploy --cmd 'npm run build'
else
	echo "CONVEX_DEPLOY_KEY not set; building against PUBLIC_CONVEX_URL=$PUBLIC_CONVEX_URL"
	npm run build
fi
