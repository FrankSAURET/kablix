# Transforme la cascade if/else-if de executeThumb16 en :
#   classifyThumb16(opcode) -> index de branche   (la MÊME cascade, sans corps)
#   THUMB16_OP : Uint8Array(65536), table opcode -> index, bâtie une fois
#   executeThumb16 : switch dense sur la table (saut de table V8, plus de cascade)
import io, re, sys

SRC = 'src/cortex-m33/execute-thumb16.ts'
lignes = io.open(SRC, encoding='utf-8').read().split('\n')

debut = next(i for i, l in enumerate(lignes) if l.startswith('export function executeThumb16('))
fin = next(i for i in range(debut + 1, len(lignes)) if lignes[i] == '}')

# Découpage en branches top-level (indentation 2), corps délimité par accolades.
branches = []   # (condition|None, [lignes de corps], commentaire précédent)
prologue_fin = None
i = debut + 1
while i < fin:
    l = lignes[i]
    m = re.match(r'^  (else if|if|else) ?(.*)$', l)
    if not m:
        i += 1
        continue
    if prologue_fin is None:
        prologue_fin = i
        # les lignes de commentaire juste avant appartiennent à la branche
        while prologue_fin > debut + 1 and lignes[prologue_fin - 1].strip().startswith('//'):
            prologue_fin -= 1
    tete = l
    assert tete.rstrip().endswith('{'), f'condition multi-lignes ligne {i+1} : {tete}'
    cond = None
    if m.group(1) != 'else':
        cond = re.match(r'^  (?:else )?if \((.*)\) \{$', tete).group(1)
    # corps : jusqu'à l'accolade fermante équilibrée
    prof = 1
    corps = []
    j = i + 1
    while prof > 0:
        lj = lignes[j]
        prof += lj.count('{') - lj.count('}')
        if prof > 0:
            corps.append(lj)
        j += 1
    # commentaire de tête (documentation de l'instruction)
    com = []
    k = i - 1
    while k > debut and lignes[k].strip().startswith('//'):
        com.insert(0, lignes[k])
        k -= 1
    branches.append((cond, corps, com))
    i = j
    fin_derniere = j

assert branches[-1][0] is None, 'la dernière branche doit être le else final'
n = len(branches)
print(f'{n} branches (dont le else final), prologue jusqu\'à la ligne {prologue_fin}')

prologue = lignes[debut + 1:prologue_fin]
epilogue = [l for l in lignes[fin_derniere:fin] if l.strip()]
print('épilogue :', epilogue)

# --- classifyThumb16 : la cascade d'origine, corps remplacés par l'index ---
out = []
out.append('/**')
out.append(' * Décodage pur : rend l\'index de branche d\'un opcode Thumb-16.')
out.append(' * C\'est la cascade d\'origine, corps retirés — elle ne tourne plus qu\'une fois')
out.append(' * par opcode possible, à la construction de THUMB16_OP.')
out.append(' */')
out.append('function classifyThumb16(opcode: number): number {')
for idx, (cond, _corps, com) in enumerate(branches):
    for c in com:
        out.append(c)
    if cond is None:
        out.append(f'  return {idx};')
    else:
        mot = 'if' if idx == 0 else 'if'
        out.append(f'  {mot} (({cond})) return {idx};')
out.append('}')
out.append('')
out.append('/**')
out.append(' * Table de décodage : 64 Ko, bâtie une fois au chargement (~65 k appels de')
out.append(' * classifyThumb16, quelques millisecondes). Elle remplace une cascade de')
out.append(f' * jusqu\'à {n} comparaisons par une lecture indexée, à chaque instruction.')
out.append(' */')
out.append('const THUMB16_OP = /* @__PURE__ */ (() => {')
out.append('  const table = new Uint8Array(0x10000);')
out.append('  for (let opcode = 0; opcode < 0x10000; opcode++) table[opcode] = classifyThumb16(opcode);')
out.append('  return table;')
out.append('})();')
out.append('')

# --- executeThumb16 : switch dense ---
out.append(lignes[debut])
out += prologue
out.append('  switch (THUMB16_OP[opcode]) {')
for idx, (cond, corps, com) in enumerate(branches):
    for c in com:
        out.append('  ' + c)
    if cond is None:
        out.append('    default: {')
    else:
        out.append(f'    case {idx}: {{')
    for c in corps:
        out.append('    ' + c if c.strip() else c)
    out.append('      break;')
    out.append('    }')
out.append('  }')
out += epilogue
out.append('}')

nouveau = lignes[:debut] + out + lignes[fin + 1:]
io.open('src/cortex-m33/execute-thumb16.ts', 'w', encoding='utf-8', newline='').write('\n'.join(nouveau))
print('écrit')
