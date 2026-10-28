#!/usr/bin/env bash
# Robinhood testnet deploy. The private key stays in the shell, never in this file.
set -euo pipefail

cd "$(dirname "$0")"
export PATH="/root/.foundry/bin:${PATH}"

if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
  echo "Set DEPLOYER_PRIVATE_KEY in this shell first. Do not write it into a file." >&2
  exit 1
fi

expected="0xdc28De74214F892b13727ba54AfA804A5fC0a4a8"
actual="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
if [[ "${actual,,}" != "${expected,,}" ]]; then
  echo "Signer is ${actual}. This script only deploys from ${expected}." >&2
  exit 1
fi

echo "Signer ${actual}"
echo "Chain 46630 Robinhood testnet"

forge script script/DeployRobinhoodTestnet.s.sol \
  --rpc-url https://rpc.testnet.chain.robinhood.com \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast
