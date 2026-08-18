import subprocess
import os

cwd = r"c:\Users\mohit\OneDrive\Documents\Mudit FIles\cloud project"

def run(cmd):
    p = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if p.returncode != 0:
        print(f"Error running {cmd}: {p.stderr}")
    else:
        print(f"Success: {cmd}\n{p.stdout}")
    return p

# 1. Reset soft to 6229b21
run("git reset --soft 6229b21")

# 2. Commit 1: Dockerfile
run("git add Dockerfile")
run('git commit -m "added root dockerfile and container configuration"')

# 3. Commit 2: README
run("git add README.md")
run('git commit -m "added live gcp cloud run deployment link to readme"')

# 4. Commit 3: Bigquery script and lakehouse
run("git add scripts/load_bigquery.py data/lakehouse/")
run('git commit -m "added bigquery lakehouse tables and loading script"')

# 5. Clean untracked helper scripts
if os.path.exists(os.path.join(cwd, "scripts", "clean_commits.py")):
    os.remove(os.path.join(cwd, "scripts", "clean_commits.py"))
if os.path.exists(os.path.join(cwd, "scripts", "rebuild_git.py")):
    os.remove(os.path.join(cwd, "scripts", "rebuild_git.py"))

# 6. Push to origin main
run("git push origin main --force")
