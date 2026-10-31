"""List every GLOBAL/STACK_GLOBAL reference in a torch .pt zip without unpickling it."""
import sys, zipfile, pickletools, collections
z = zipfile.ZipFile(sys.argv[1])
pk = [n for n in z.namelist() if n.endswith('.pkl')]
refs = collections.Counter()
for n in pk:
    data = z.read(n)
    strings = []
    for op, arg, pos in pickletools.genops(data):
        if op.name in ('SHORT_BINUNICODE', 'BINUNICODE', 'UNICODE', 'STRING', 'BINSTRING', 'SHORT_BINSTRING'):
            strings.append(arg)
        elif op.name == 'GLOBAL':
            refs[arg.replace(' ', '.')] += 1
        elif op.name == 'STACK_GLOBAL' and len(strings) >= 2:
            refs[f"{strings[-2]}.{strings[-1]}"] += 1
print('pickle files:', pk)
mods = collections.Counter(r.split('.')[0] for r in refs)
print('top-level modules:', dict(mods))
sus = [r for r in refs if r.split('.')[0] in ('os', 'subprocess', 'builtins', 'posix', 'nt', 'sys', 'socket', 'shutil', 'importlib', 'runpy', 'pty', 'webbrowser', 'requests', 'urllib')]
print('suspicious references:', sus or 'none')
