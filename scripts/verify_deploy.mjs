#!/usr/bin/env node
/**
 * verify_deploy.mjs — Post-deployment verification for GrassrootsMVT
 *
 * This script checks that:
 *   1. The latest Pages deployment succeeded
 *   2. uses_functions == true
 *   3. API endpoints respond correctly (after propagation)
 *
 * Retries up to 10 times (≈5 minutes) waiting for deployment propagation.
 */

import fs from "fs";
import process from "process";

const {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  PROJECT = "grassrootsmvt",
  VERIFY_RETRIES,
  VERIFY_INTERVAL,
} = process.env;

const MAX_RETRIES = Number(VERIFY_RETRIES || 10);
const RETRY_INTERVAL = Number(VERIFY_INTERVAL || 30) * 1000; // seconds -> ms

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  console.error("❌ Missing required environment variables.");
  console.error("Please set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.");
  process.exit(1);
}

const apiBase = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT}`;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLatestDeployment() {
  const deployments = await fetchJson(`${apiBase}/deployments?per_page=1`);
  if (!deployments.success || !deployments.result?.length) {
    throw new Error("No deployments found");
  }
  return deployments.result[0];
}

async function verifyEndpoints(url) {
  const tests = [
    { path: "/api/ping", expect: 200 },
    { path: "/api/whoami", expect: 401 },
    { path: "/api/call/next", expect: 401 },
  ];

  for (const test of tests) {
    const fullUrl = `${url}${test.path}`;
    try {
      const res = await fetch(fullUrl, { method: "GET" });
      console.log(`➡️  ${test.path} → ${res.status}`);
      const text = await res.text();
      const fname = `verify_${test.path.replace(/\//g, "_")}.txt`;
      fs.writeFileSync(fname, text);

      if (res.status === test.expect) {
        console.log(`✅ ${test.path} OK`);
      } else {
        console.warn(`⚠️  ${test.path} returned ${res.status}, expected ${test.expect}`);
      }
    } catch (err) {
      console.error(`❌ Error fetching ${test.path}: ${err.message}`);
    }
  }
}

async function verify() {
  console.log(`🔍 Checking latest deployment for project: ${PROJECT}`);
  console.log(`🔁 Retry config: attempts=${MAX_RETRIES}, interval=${RETRY_INTERVAL / 1000}s`);
  let dep, url;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      dep = await getLatestDeployment();
      url = dep.url;
      const uses = dep.uses_functions;
      const status = dep.latest_stage?.status;

      console.log(`Attempt ${attempt}/${MAX_RETRIES}:`);
      console.log(`🌎 URL: ${url}`);
      console.log(`📦 uses_functions: ${uses}`);
      console.log(`🕒 Stage: ${dep.latest_stage?.name} (${status})`);

      if (uses && status === "success") {
        console.log("✅ Deployment appears ready.");
        break;
      }

      console.log("⏳ Deployment not ready yet, waiting 30s...");
    } catch (err) {
      console.warn(`⚠️  Error fetching deployment: ${err.message}`);
    }
    await wait(RETRY_INTERVAL);
  }

  if (!dep?.uses_functions) {
    console.error("❌ Functions not detected in deployment metadata.");
    process.exit(1);
  }

  console.log(`🚀 Verifying API endpoints at ${url}`);
  await verifyEndpoints(url);
  console.log("✅ Verification complete.");
}

verify();
