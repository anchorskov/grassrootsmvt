import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { initHelpModal } from '../ui/shared/helpModal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const helpDir = path.join(projectRoot, 'ui', 'help');

const helpFiles = fs
  .readdirSync(helpDir)
  .filter(name => name.endsWith('.md'))
  .sort();

const helpContent = new Map(
  helpFiles.map(name => {
    const fullPath = path.join(helpDir, name);
    const markdown = fs.readFileSync(fullPath, 'utf8');
    return [
      `/help/${name}`,
      {
        markdown,
        headline: extractHeadline(markdown),
        path: fullPath,
      },
    ];
  })
);

function extractHeadline(markdown) {
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('<!--')) continue;
    if (line.startsWith('# ')) return line.slice(2).trim();
    if (line.startsWith('## ')) return line.slice(3).trim();
    if (line.startsWith('### ')) return line.slice(4).trim();
    return line.slice(0, 60);
  }
  return 'instructions';
}

function setupDom() {
  const { window, document } = parseHTML('<!doctype html><html><head></head><body></body></html>');
  globalThis.window = window;
  globalThis.document = document;
  globalThis.Event = window.Event;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.navigator = window.navigator;
  return { window, document };
}

function teardownDom() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.Event;
  delete globalThis.HTMLElement;
  delete globalThis.Node;
  delete globalThis.CustomEvent;
  delete globalThis.navigator;
  delete globalThis.fetch;
}

function waitFor(condition, timeout = 1000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tick() {
      if (condition()) return resolve();
      if (Date.now() - start > timeout) {
        return reject(new Error('Timed out waiting for condition'));
      }
      setTimeout(tick, 10);
    }
    tick();
  });
}

test('help modal loads every markdown guide', async t => {
  for (const name of helpFiles) {
    await t.test(name, async () => {
      const { window, document } = setupDom();
      const helpPath = `/help/${name}`;
      const entry = helpContent.get(helpPath);

      assert.ok(entry, `Missing help content for ${name}`);

      globalThis.fetch = async input => {
        const target =
          typeof input === 'string'
            ? input
            : input?.url
            ? new URL(input.url, 'http://localhost').pathname
            : '';
        const normalized = target.startsWith('http') ? new URL(target).pathname : target;
        const lookup = helpContent.get(normalized);
        if (!lookup) {
          return {
            ok: false,
            status: 404,
            text: async () => '',
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => lookup.markdown,
        };
      };

      initHelpModal({
        helpPath,
        title: `Testing ${name}`,
        toggleLabel: 'Help',
      });

      const checkbox = document.querySelector('.help-toggle input');
      assert.ok(checkbox, 'Help toggle checkbox missing');

      checkbox.checked = true;
      checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));

      const modal = document.querySelector('.help-modal');
      assert.ok(modal, 'Help modal container missing');

      const body = document.querySelector('.help-modal__body');
      assert.ok(body, 'Help modal body missing');

      await waitFor(() => body.textContent.includes(entry.headline));

      assert.ok(
        body.textContent.includes(entry.headline),
        `Expected help headline "${entry.headline}" in modal body`
      );

      // Close workflow
      checkbox.checked = false;
      checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
      await waitFor(() => !modal.classList.contains('open'));

      teardownDom();
    });
  }
});
