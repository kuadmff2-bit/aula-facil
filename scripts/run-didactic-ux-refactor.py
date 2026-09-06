import re
import runpy

original_subn = re.subn

def literal_subn(pattern, repl, string, count=0, flags=0):
    if isinstance(repl, str):
        return original_subn(pattern, lambda _match: repl, string, count=count, flags=flags)
    return original_subn(pattern, repl, string, count=count, flags=flags)

re.subn = literal_subn
runpy.run_path("scripts/apply-didactic-ux-refactor.py", run_name="__main__")
