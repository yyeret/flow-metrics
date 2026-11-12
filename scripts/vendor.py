"""Refresh or verify the dependency-free runtime vendored by each consumer."""
import argparse
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("consumer", choices=["jira-flow-coaching", "github-analytics"])
    parser.add_argument("checkout", type=Path)
    parser.add_argument("--revision", default="HEAD")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    revision = git("rev-parse", "--verify", "--end-of-options", f"{args.revision}^{{commit}}").decode().strip()
    checkout = args.checkout.resolve()
    sentinel = "js/metrics.js" if args.consumer == "jira-flow-coaching" else "analyze.py"
    if not (checkout / sentinel).is_file():
        parser.error(f"{checkout} does not contain {sentinel}")

    origin = f"Vendored from yyeret/flow-metrics at {revision}. Refresh using scripts/vendor.py upstream.\n"
    python = git("show", f"{revision}:flow_metrics_core.py")
    files = {
        "vendor/FLOW-METRICS-LICENSE": git("show", f"{revision}:LICENSE"),
        "flow_metrics_core.py": f"# {origin}".encode("utf-8") + python,
    }
    if args.consumer == "jira-flow-coaching":
        classic = git("show", f"{revision}:flow-metrics.js").decode("utf-8")
        node_entry = git("show", f"{revision}:index.mjs").decode("utf-8")
        body, export = classic.rsplit("\nif (typeof module ", 1)
        if "module.exports = FlowMetrics;" not in export or not node_entry.startswith("import FlowMetrics "):
            raise SystemExit("The JavaScript module entry changed. Update the vendor script.")
        browser_exports = node_entry.split("\n", 1)[1]
        files["vendor/flow-metrics.mjs"] = f"// {origin}{body}{browser_exports}".encode("utf-8")

    for name, expected in files.items():
        path = checkout / name
        if args.check:
            if not path.is_file() or path.read_bytes() != expected:
                raise SystemExit(f"{path} differs from {revision}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(expected)
        print(f"{revision[:12]} {path}")


if __name__ == "__main__":
    main()
