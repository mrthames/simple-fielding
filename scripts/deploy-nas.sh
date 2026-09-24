#!/usr/bin/env bash
#
# Deploys simplefielding.com to the web server: the website at the root, the web app under /app/.
# Same layout GitHub Pages gets (see .github/workflows/pages.yml).
#
# Connection details are not kept in the repo. Set them in the environment (for Claude Code, in its
# gitignored local settings file under .claude/):
#
#     SF_NAS_HOST   SF_NAS_PORT   SF_NAS_USER   SF_NAS_KEY   (path to the SSH key)
#     SF_NAS_DIR    defaults to the site folder
#
#     bash scripts/deploy-nas.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

: "${SF_NAS_HOST:?set SF_NAS_HOST}" "${SF_NAS_PORT:?set SF_NAS_PORT}" "${SF_NAS_USER:?set SF_NAS_USER}" "${SF_NAS_KEY:?set SF_NAS_KEY}"
DIR="${SF_NAS_DIR:-the site folder}"

# Assemble exactly what gets published.
rm -rf _site
mkdir -p _site/app
cp -r website/. _site/
cp -r app/. _site/app/
rm -f _site/.nojekyll

echo "Deploying $(git describe --always --dirty) to ${DIR}"
ssh_cmd=(ssh -o BatchMode=yes -p "$SF_NAS_PORT" -i "$SF_NAS_KEY" "$SF_NAS_USER@$SF_NAS_HOST")

# Upload into a fresh folder, then swap it in, so visitors never see a half-copied site.
# The previous version is kept beside it as <dir>.prev for a one-command rollback.
tar -C _site -cf - . | "${ssh_cmd[@]}" "set -e
  rm -rf '${DIR}.next' && mkdir -p '${DIR}.next'
  tar -C '${DIR}.next' -xf -
  chmod -R a+rX '${DIR}.next'
  if [ -d '${DIR}' ]; then rm -rf '${DIR}.prev'; mv '${DIR}' '${DIR}.prev'; fi
  mv '${DIR}.next' '${DIR}'
  echo 'on the NAS:'; ls '${DIR}' | tr '\n' ' '; echo"
rm -rf _site
echo "Done. Rollback: ssh in and swap ${DIR}.prev back."
