#!/usr/bin/env python3
"""
Scan .github/workflows/*.yml and ensure any step that runs 'wrangler pages' has an explicit
working-directory set in the same step. If any such step is missing working-directory, print
warnings and exit 1. Otherwise exit 0.

This script uses only the Python standard library and performs a conservative, indentation-aware
scan of workflows rather than relying on a full YAML parser so it remains self-contained.
"""
import glob
import re
import sys
import os


def load_lines(path):
    with open(path, 'r', encoding='utf-8') as fh:
        return fh.read().splitlines()


def is_list_item(line):
    return re.match(r'^\s*-\s', line) is not None


def indent_level(line):
    return len(line) - len(line.lstrip(' '))


def analyze_workflow(path):
    lines = load_lines(path)
    warnings = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if re.match(r'^\s*steps\s*:\s*$', line):
            steps_indent = indent_level(line)
            i += 1
            # iterate over steps
            while i < n:
                l = lines[i]
                if l.strip() == '':
                    i += 1
                    continue
                curr_indent = indent_level(l)
                # if we left the steps block
                if curr_indent <= steps_indent:
                    break
                # detect start of a step (list item at a deeper indent)
                if is_list_item(l):
                    step_start_line = i + 1
                    step_indent = curr_indent
                    step_lines = [l]
                    i += 1
                    # collect step block
                    while i < n:
                        nl = lines[i]
                        if nl.strip() == '':
                            step_lines.append(nl)
                            i += 1
                            continue
                        nl_indent = indent_level(nl)
                        # next step or leaving steps block
                        if nl_indent <= step_indent and is_list_item(nl):
                            break
                        if nl_indent <= steps_indent:
                            break
                        step_lines.append(nl)
                        i += 1

                    # analyze the collected step
                    has_working = any(re.match(r'^\s*working-directory\s*:', s) for s in step_lines)
                    # find run: entries
                    for idx, s in enumerate(step_lines):
                        if re.match(r'^\s*run\s*:', s):
                            run_indent = indent_level(s)
                            run_content = []
                            # if scalar block (| or >) then subsequent lines with greater indent
                            if '|' in s or '>' in s:
                                p = idx + 1
                                while p < len(step_lines):
                                    ln = step_lines[p]
                                    if ln.strip() == '':
                                        p += 1
                                        continue
                                    if indent_level(ln) > run_indent:
                                        run_content.append(ln.strip())
                                        p += 1
                                        continue
                                    break
                            else:
                                # inline run: value after colon
                                parts = s.split(':', 1)
                                if len(parts) > 1:
                                    run_content.append(parts[1].strip())

                            run_text = '\n'.join(run_content)
                            # look for wrangler usage
                            if re.search(r'\bwrangler\b.*\bpages\b', run_text) or re.search(r'\bnpx\b.*\bwrangler\b', run_text):
                                if not has_working:
                                    warnings.append((path, step_start_line))
                else:
                    i += 1
        else:
            i += 1

    return warnings


def main():
    files = glob.glob('.github/workflows/*.yml')
    all_warnings = []
    for f in files:
        w = analyze_workflow(f)
        if w:
            all_warnings.extend(w)

    if all_warnings:
        print('\nDetected working-directory issues:')
        for path, line_no in all_warnings:
            print(f"- {path}: step starting near line {line_no} runs 'wrangler pages' but has no 'working-directory' set")
        print('\nPlease add a `working-directory: ui` (or appropriate path) to the offending steps.')
        sys.exit(1)
    else:
        print('OK - all workflow wrangler steps include working-directory when required')
        sys.exit(0)


if __name__ == '__main__':
    main()
