#!/usr/bin/env node
/**
 * verify_deploy.mjs — Hardened CI version
 *
 * Purpose:
 *  - Validates latest Cloudflare Pages deployment
 *  - Confirms functions build (uses_functions: true)
 *  - Probes /api endpoints for expected responses
 *  - Retries API and network calls with backoff
 *  - Produces detailed artifacts for CI verification
 *
 * Required ENV:
 *  CLOUDFLARE_API_TOKEN
 *  CLOUDFLARE_ACCOUNT_ID
 *  PROJECT
 */

import fs from "fs";
import fetch, { AbortController } from "node-fetch";

const {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  PROJECT,
} = process.env;

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID || !PROJECT) {
  console.error("❌ Missing required environment variables.");
  console.error(
    "   Required: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, PROJECT"
  );
  process.exit(1);
}

const API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT}/deployments?per_page=1`;
const HEADERS = { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` };
const SUMMARY_FILE = "verify_summary.txt";
const SUMMARY_JSON = "verify_report.json";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, opts = {}, retries = 4, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      if (res.status === 429) {
        const retryAfter = (i + 1) * delayMs;
        console.warn(`⚠️ Rate-limited (429), retrying in ${retryAfter}ms`);
        await delay(retryAfter);
        continue;
      }
      throw new Error(`HTTP ${res.status} - ${res.statusText}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`⚠️ Fetch failed (${err.message}), retrying in ${delayMs}ms`);
      await delay(delayMs);
    }
  }
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function verifyDeployment() {
  console.log(`🚀 Verifying Cloudflare Pages deployment for project: ${PROJECT}`);
  console.log(`Fetching deployments from Cloudflare API...`);

  const apiRes = await fetchWithRetry(API_BASE, { headers: HEADERS });
  const data = await apiRes.json();

  if (!apiRes.ok) {
    console.error("❌ Cloudflare API returned error:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const latest = data.result?.[0];
  if (!latest) {
    console.error("❌ No deployments found for project.");
    process.exit(1);
  }

  const usesFunctions =
    latest?.deployment_trigger?.metadata?.uses_functions ??
    latest?.uses_functions;

  if (!usesFunctions) {
    console.error("❌ uses_functions is false — no Functions bundle detected!");
    process.exit(1);
  }

  const deployURL = `https://${latest.subdomain}`;
  console.log(`✅ uses_functions: true`);
  console.log(`🌎 Deployment URL: ${deployURL}`);
  console.log("🔍 Probing API endpoints...");

  const endpoints = ["api/ping", "api/whoami", "api/next"];
  const results = [];

  for (const path of endpoints) {
    const fullURL = `${deployURL}/${path}`;
    try {
      const res = await fetchWithTimeout(fullURL);
      const text = await res.text();
      fs.writeFileSync(`verify__api_${path.replace(/\//g, "_")}.txt`, text);
      const okStatuses = [200, 401];
      const ok = okStatuses.includes(res.status);
      results.push({
        endpoint: path,
        status: res.status,
        ok,
      });
      console.log(`${ok ? "✅" : "❌"} ${path} → ${res.status}`);
    } catch (err) {
      console.error(`❌ ${path} fetch failed: ${err.message}`);
      results.push({
        endpoint: path,
        status: "error",
        ok: false,
        error: err.message,
      });
    }
  }

  const allOK = results.every((r) => r.ok);
  const summary = [
    `Project: ${PROJECT}`,
    `Deploy URL: ${deployURL}`,
    `uses_functions: ${usesFunctions}`,
    `Endpoints checked: ${endpoints.length}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Results:`,
    ...results.map(
      (r) => `  - ${r.endpoint}: ${r.status} ${r.ok ? "✅ OK" : "❌ FAIL"}`
    ),
  ].join("\n");

  fs.writeFileSync(SUMMARY_FILE, summary);
  fs.writeFileSync(SUMMARY_JSON, JSON.stringify({ project: PROJECT, deployURL, usesFunctions, results }, null, 2));

  console.log("\n📋 Summary:\n" + summary);
  if (!allOK) {
    console.error("❌ Verification failed for one or more endpoints.");
    process.exit(1);
  }

  console.log("✨ All checks passed successfully.");
}

verifyDeployment().catch((err) => {
  console.error("💥 Unhandled verification error:", err);
  process.exit(1);
});
