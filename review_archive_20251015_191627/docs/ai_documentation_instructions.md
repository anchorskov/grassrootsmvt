Filename:

docs/ai_documentation_instructions.md

# 🤖 AI Documentation Instructions

> **Purpose:**  
> This file guides AI tools (like GitHub Copilot or ChatGPT) on how to read, update, and maintain documentation for the **GrassrootsMVT** Cloudflare Worker project.
>
> Treat this document as the "AI memory file" — it explains how to interact with the `/docs` folder safely and consistently.

---

## 🧩 1. Project Context

**GrassrootsMVT** is a grassroots voter outreach platform integrating:
- **Cloudflare Workers** + **D1 database** (SQLite-compatible)
- **Zero Trust Access** control (email-based authentication)
- **UI and API layers** for volunteer/voter coordination tools
- **Local development** (`wy_preview`) and **production** (`wy`) environments

Documentation lives in `/docs/` and should always reflect the latest verified configuration.

---

## 🗂️ 2. Documentation Files and Their Roles

| File | Description | AI Guidance |
|------|-------------|-------------|
| `overview.md` | High-level system overview (purpose, components, architecture) | Keep concise. Only update when major architectural changes occur. |
| `journal.md` | Developer changelog of updates, tests, and fixes | **Always append** new timestamped entries. **Never edit or delete** old entries. |
| `cloudflare_setup.md` | Instructions for Cloudflare Workers, D1, and Zero Trust setup | Update when Cloudflare config changes. Keep step-by-step clarity. |
| `wrangler_config.md` | Explains wrangler.toml settings and database bindings | Append environment changes (local/production). Don't reformat existing blocks. |
| `deployment.md` | Deploy + rollback instructions | Keep production-verified commands up to date. Add new methods as sections. |
| `troubleshooting.md` | Known errors + fixes | Add new error/fix sections with clear cause + resolution. **Never delete** old ones. |

**Note:** If files become redundant (e.g., `wrangler_config.md` and `cloudflare_setup.md` repeating info), merge content and remove duplicate with a journal entry.

---

## 🧭 3. AI Editing Rules

When editing or appending to any `/docs` file:

### ✅ DO:
- **Always append** new content at the bottom, never overwrite
- **Start every entry** with a timestamp and title:
  ```markdown
  ## [2025-10-11 09:42] – Updated Wrangler Production Deployment
  ```
- Use **clean Markdown** headings (`##`, `###`) and lists
- Keep sentences **short, technical, and factual**
- **Summarize** what changed, what was tested, and results

### 🚫 DON'T:
- Don't delete or rewrite old journal entries
- Don't add conversational filler text ("I think", "maybe")
- Don't overwrite existing configuration sections
- Don't introduce new formatting styles (stick to Markdown headings + bullet lists)

---

## 🕒 4. Adding Entries Automatically

To add a new journal entry manually or via terminal:

```bash
echo "## [$(date '+%Y-%m-%d %H:%M')] – " >> docs/journal.md
```

Then continue typing your summary below it.

---

## ✍️ 5. AI Example Prompts

These examples show how to communicate with AI tools safely:

| Goal | Example Prompt |
|------|----------------|
| Log configuration change | "Append a new entry to docs/journal.md with timestamp describing the update to wrangler.toml for production." |
| Add troubleshooting case | "Add a new section to docs/troubleshooting.md describing the Wrangler D1 binding error and its resolution." |
| Update Cloudflare setup | "Modify docs/cloudflare_setup.md to reflect the new Access policy restricted to volunteer emails." |
| Summarize changes | "Summarize the last three journal entries into a one-paragraph project status update." |

---

## 🧱 6. Markdown Integrity Check

AI must preserve Markdown structure. Before committing, verify formatting:

```bash
npx markdownlint docs/
```

If issues are found, AI should fix formatting (heading levels, list spacing, etc.) without changing content meaning.

---

## 🧮 7. Commit Rules

Every documentation update gets its own commit:

```bash
git add docs/
git commit -m "Update docs/journal.md with Cloudflare Zero Trust setup steps"
```

Tag major documentation milestones:

```bash
git tag docs-2025-10-11
git push origin --tags
```

---

## 🧭 8. Context Recovery (Memory Drift)

When starting a new session with Copilot or ChatGPT:

1. **Ask it to read** `docs/ai_documentation_instructions.md` to understand documentation rules
2. **Reference the file** you're editing (e.g., "We're updating journal.md")
3. **Optionally paste** the last few lines of the file to re-establish context

This ensures the AI resumes consistent formatting and tone.

---

## ✅ Summary for AI Tools

### Always:
- ✅ **Append, don't overwrite**
- ✅ **Add timestamps**
- ✅ **Keep Markdown valid**
- ✅ **Reflect actual system state**
- ✅ **Stay concise, technical, and factual**

### Never:
- ❌ **Delete or rewrite old logs**
- ❌ **Add conversational commentary**
- ❌ **Invent content not verified by test results**

---

## 📝 Current Documentation Status

**Last Updated:** 2025-10-10  
**Files Count:** 6 documentation files in `/docs`  
**Architecture:** Pure Cloudflare Worker (post-migration from Pages Functions)  
**Database:** D1 with local `wy_preview` (50 records) and production `wy` (274k+ records)

✨ Full Example Template
# 🤖 AI Documentation Instructions

> **Purpose:**  
> This file guides AI tools (like GitHub Copilot or ChatGPT) on how to read, update, and maintain documentation for the **GrassrootsMVT** Cloudflare Worker project.
>
> Treat this document as the “AI memory file” — it explains how to interact with the `/docs` folder safely and consistently.

---

## 🧩 1. Project Context

GrassrootsMVT integrates:
- Cloudflare Workers + D1 database
- Zero Trust Access control (email-based)
- UI and API layers for volunteer/voter tools
- Local development (`wy_preview`) and production (`wy`) environments

Documentation lives in `/docs/` and should always reflect the latest verified configuration.

---

## 🗂️ 2. Documentation Files and Their Roles

| File | Description | Copilot Guidance |
|------|--------------|------------------|
| `overview.md` | High-level system overview (purpose, components, architecture) | Keep concise. Only update when major architectural changes occur. |
| `journal.md` | Developer changelog of updates, tests, and fixes | Always append a new timestamped entry. Never edit or delete old entries. |
| `cloudflare_setup.md` | Instructions for setting up Cloudflare Workers, D1, and Zero Trust | Update when Cloudflare config changes. Keep step-by-step clarity. |
| `wrangler_config.md` | Explains wrangler.toml settings and database bindings | Append environment changes (local/production). Don’t reformat existing blocks. |
| `deployment.md` | Deploy + rollback instructions | Keep production verified commands up to date. Add new deployment methods as sections. |
| `troubleshooting.md` | Known errors + fixes | Add new error/fix sections with clear cause + resolution. Never delete old ones. |

If a file becomes redundant (e.g., `wrangler_config.md` and `cloudflare_setup.md` start repeating info), merge the content and remove the duplicate file with a journal entry.

---

## 🧭 3. Copilot Editing Rules

When editing or appending to any `/docs` file:

### ✅ DO:
- Always **append new content at the bottom**, never overwrite.
- Start every entry with a **timestamp and title**, e.g.:
  ```markdown
  ## [2025-10-11 09:42] – Updated Wrangler Production Deployment


Use clean Markdown headings (##, ###) and lists.

Keep sentences short, technical, and factual.

Summarize what changed, what was tested, and results.

🚫 DON’T:

Don’t delete or rewrite old journal entries.

Don’t add conversational filler text (“I think”, “maybe”).

Don’t overwrite existing configuration sections.

Don’t introduce new formatting styles (stick to Markdown headings + bullet lists).

🕒 4. Adding Entries Automatically

To add a new journal entry manually or via terminal:

echo "## [$(date '+%Y-%m-%d %H:%M')] – " >> docs/journal.md


Then continue typing your summary below it.

✍️ 5. Copilot Example Prompts

These examples show how to talk to Copilot safely.

Goal	Example Prompt
Log a configuration change	“Append a new entry to docs/journal.md with a timestamp describing the update to wrangler.toml for production.”
Add a troubleshooting case	“Add a new section to docs/troubleshooting.md describing the Wrangler D1 binding error and its resolution.”
Update Cloudflare setup	“Modify docs/cloudflare_setup.md to reflect the new Access policy restricted to volunteer emails.”
Summarize changes	“Summarize the last three journal entries into a one-paragraph project status update.”
🧱 6. Markdown Integrity Check

Copilot must preserve Markdown structure.
Before committing, verify formatting by running:

npx markdownlint docs/


If issues are found, Copilot should fix formatting (heading levels, list spacing, etc.) without changing content meaning.

🧮 7. Commit Rules

Every doc update is its own commit.

Example:

git add docs/
git commit -m "Update docs/journal.md with Cloudflare Zero Trust setup steps"


Tag major documentation milestones:

git tag docs-2025-10-11
git push origin --tags

🧭 8. If Copilot’s Context is Lost (Memory Drift)

When you start a new session with Copilot or ChatGPT:

Ask it to “Read docs/ai_documentation_instructions.md to understand documentation rules.”

Then reference which file you’re editing (e.g., “We’re updating journal.md”).

Optionally paste the last few lines of the file to re-establish context.

This ensures the AI resumes consistent formatting and tone.

✅ Summary for AI Helpers

Always:

Append, don’t overwrite.

Add timestamps.

Keep Markdown valid.

Reflect actual system state.

Stay concise, technical, and factual.

Never:

Delete or rewrite old logs.

Add conversational commentary.

Invent content not verified by test results.