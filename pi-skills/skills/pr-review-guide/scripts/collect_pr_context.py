#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path


def run(cmd, cwd=None, check=False):
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if check and proc.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(cmd)}\n{proc.stderr.strip()}")
    return {
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
    }


def git(cmd, cwd=None, check=False):
    return run(["git", *cmd], cwd=cwd, check=check)


def detect_repo_root():
    out = git(["rev-parse", "--show-toplevel"])
    if out["returncode"] != 0:
        raise RuntimeError("not inside a git repository")
    return out["stdout"]


def detect_branch(repo_root):
    out = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=repo_root, check=True)
    return out["stdout"]


def gh_ready():
    gh_path = shutil.which("gh")
    if not gh_path:
        return False, False, "gh is not installed"
    auth = run(["gh", "auth", "status", "-h", "github.com"])
    if auth["returncode"] != 0:
        return True, False, auth["stderr"] or "gh is not authenticated"
    return True, True, ""


def detect_base_branch(repo_root):
    candidates = []

    origin_head = git(["symbolic-ref", "refs/remotes/origin/HEAD"], cwd=repo_root)
    if origin_head["returncode"] == 0 and origin_head["stdout"]:
        ref = origin_head["stdout"].strip()
        if ref.startswith("refs/remotes/origin/"):
            candidates.append(ref.split("refs/remotes/origin/", 1)[1])

    for name in ["main", "master", "develop", "dev"]:
        candidates.append(name)

    seen = set()
    ordered = []
    for c in candidates:
        if c and c not in seen:
            ordered.append(c)
            seen.add(c)

    for candidate in ordered:
        local_ok = git(["show-ref", "--verify", f"refs/heads/{candidate}"], cwd=repo_root)
        remote_ok = git(["show-ref", "--verify", f"refs/remotes/origin/{candidate}"], cwd=repo_root)
        if local_ok["returncode"] == 0 or remote_ok["returncode"] == 0:
            return candidate

    return None


def merge_base_range(repo_root, base_branch):
    if not base_branch:
        return None
    remote_ref = f"origin/{base_branch}"
    remote_ok = git(["rev-parse", "--verify", remote_ref], cwd=repo_root)
    if remote_ok["returncode"] == 0:
        return f"{remote_ref}...HEAD"
    local_ok = git(["rev-parse", "--verify", base_branch], cwd=repo_root)
    if local_ok["returncode"] == 0:
        return f"{base_branch}...HEAD"
    return None


def collect_git_diff(repo_root, base_branch):
    diff_range = merge_base_range(repo_root, base_branch)
    if diff_range:
        files = git(["diff", "--name-only", diff_range], cwd=repo_root)
        stat = git(["diff", "--stat=200", diff_range], cwd=repo_root)
        commits = git(["log", "--format=%s", diff_range], cwd=repo_root)
        if files["returncode"] == 0:
            return {
                "range": diff_range,
                "changed_files": [line for line in files["stdout"].splitlines() if line.strip()],
                "diffstat": stat["stdout"],
                "commit_subjects": [line for line in commits["stdout"].splitlines() if line.strip()],
            }

    files = git(["show", "--pretty=", "--name-only", "HEAD"], cwd=repo_root)
    commit_subject = git(["log", "-1", "--format=%s"], cwd=repo_root)
    return {
        "range": "HEAD",
        "changed_files": [line for line in files["stdout"].splitlines() if line.strip()],
        "diffstat": "",
        "commit_subjects": [commit_subject["stdout"]] if commit_subject["stdout"] else [],
    }


def collect_gh_pr(repo_root):
    view = run([
        "gh",
        "pr",
        "view",
        "--json",
        "number,title,body,baseRefName,headRefName,url",
    ], cwd=repo_root)
    if view["returncode"] != 0 or not view["stdout"]:
        return None, view["stderr"] or "unable to resolve current pr with gh"

    data = json.loads(view["stdout"])
    diff = run(["gh", "pr", "diff", "--name-only"], cwd=repo_root)
    changed_files = [line for line in diff["stdout"].splitlines() if line.strip()] if diff["returncode"] == 0 else []

    return {
        "number": data.get("number"),
        "title": data.get("title") or "",
        "body": data.get("body") or "",
        "base_branch": data.get("baseRefName") or "",
        "head_branch": data.get("headRefName") or "",
        "url": data.get("url") or "",
        "changed_files": changed_files,
    }, ""


def extension_counts(paths):
    counts = {}
    for path in paths:
        suffix = Path(path).suffix.lower() or "[no extension]"
        counts[suffix] = counts.get(suffix, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))


def likely_generated(paths):
    markers = [
        "dist/", "build/", "coverage/", "node_modules/", "package-lock.json", "pnpm-lock.yaml",
        "yarn.lock", "poetry.lock", ".snap", "generated", "gen/", ".min.", "vendor/"
    ]
    flagged = []
    for path in paths:
        lowered = path.lower()
        if any(marker in lowered for marker in markers):
            flagged.append(path)
    return flagged


def main():
    repo_root = detect_repo_root()
    current_branch = detect_branch(repo_root)
    today = date.today().isoformat()

    gh_installed, gh_authed, gh_message = gh_ready()
    gh_info = None
    fallback_reason = ""

    if gh_installed and gh_authed:
        gh_info, gh_error = collect_gh_pr(repo_root)
        if not gh_info:
            fallback_reason = gh_error or "unable to use gh pr view"
    else:
        fallback_reason = gh_message

    base_branch = ""
    pr_number = None
    pr_title = ""
    pr_body = ""
    pr_url = ""
    changed_files = []
    source = "local-git"

    if gh_info:
        source = "gh"
        base_branch = gh_info["base_branch"]
        pr_number = gh_info["number"]
        pr_title = gh_info["title"]
        pr_body = gh_info["body"]
        pr_url = gh_info["url"]
        changed_files = gh_info["changed_files"]
    else:
        base_branch = detect_base_branch(repo_root) or "unknown-base"

    git_context = collect_git_diff(repo_root, base_branch if base_branch != "unknown-base" else None)
    if not changed_files:
        changed_files = git_context["changed_files"]

    result = {
        "date": today,
        "repo_root": repo_root,
        "repo_name": Path(repo_root).name,
        "collection_source": source,
        "gh_available": gh_installed,
        "gh_authenticated": gh_authed,
        "fallback_reason": fallback_reason,
        "current_branch": current_branch,
        "base_branch": base_branch,
        "pr_number": pr_number,
        "pr_title": pr_title,
        "pr_body": pr_body,
        "pr_url": pr_url,
        "diff_range": git_context["range"],
        "changed_files": changed_files,
        "changed_file_count": len(changed_files),
        "diffstat": git_context["diffstat"],
        "commit_subjects": git_context["commit_subjects"],
        "extension_counts": extension_counts(changed_files),
        "likely_generated_or_low_signal_files": likely_generated(changed_files),
        "output_filename_hint": f"{current_branch}-into-{base_branch}-{today}-pr-review-guide.md",
    }

    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
