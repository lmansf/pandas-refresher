"""Independently re-validate every lesson in curriculum.json through grade.py.

For each lesson: run the reference solution, grade every alt_solution against it
(honoring order_matters), and run every concept code block. Report any failure.
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(__file__)
PY = os.path.join(HERE, "..", "pyodenv", "bin", "python")
GRADE = os.path.join(HERE, "grade.py")
lessons = json.load(open(os.path.join(HERE, "curriculum.json")))


def write(code):
    f = tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, dir="/tmp")
    f.write(code if code.endswith("\n") else code + "\n")
    f.close()
    return f.name


def run(args):
    return subprocess.run([PY, GRADE, *args], capture_output=True, text=True)


fails = []
for l in lessons:
    lid = l["id"]
    sol = write(l["solution"])
    r = run(["--run", sol])
    if r.returncode != 0:
        fails.append(f"{lid}: reference FAILED to run: {r.stderr.strip()[:200]}")
        continue
    kind = next((ln.split(": ",1)[1] for ln in r.stdout.splitlines() if ln.startswith("kind:")), "?")
    if kind != l["result_kind"]:
        fails.append(f"{lid}: result_kind mismatch: claimed {l['result_kind']}, got {kind}")
    order = ["--order"] if l["order_matters"] else []
    for i, alt in enumerate(l.get("alt_solutions", [])):
        altf = write(alt)
        g = run(["--solution", sol, "--learner", altf, *order])
        if g.returncode != 0:
            fails.append(f"{lid}: alt[{i}] did NOT grade PASS: {g.stdout.strip()} :: {alt[:80]}")
    for j, b in enumerate(l["concept_blocks"]):
        if b.get("kind") == "code":
            cf = write(b["code"])
            cr = run(["--run", cf])
            if cr.returncode != 0:
                fails.append(f"{lid}: concept code[{j}] raised: {cr.stderr.strip()[:160]}")

print(f"Re-validated {len(lessons)} lessons.")
if not fails:
    print("ALL PASS: every reference runs, every alt grades PASS, every concept example executes.")
else:
    print(f"\n{len(fails)} PROBLEM(S):")
    for f in fails:
        print("  -", f)
    sys.exit(1)
