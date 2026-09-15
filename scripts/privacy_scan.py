#!/usr/bin/env python3
"""Bounded pre-publication text/path scan. Reports locations, never matched values."""
import argparse
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'.git', 'node_modules', 'dist', '.codex', '__pycache__', 'artifacts', '.runtime'}
RULES = {
    'private-home-path': re.compile(r'/(?:Users|home)/[A-Za-z0-9_.-]+/'),
    'internal-lark-link': re.compile(r'https://(?!example\.|[a-z-]+\.example)[a-z0-9-]+\.(?:larkoffice\.com|feishuapp\.com|feishu\.cn)/', re.I),
    'private-key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'github-token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})'),
    'lark-user-id': re.compile(r'\b(?:ou|on|oc)_[0-9a-f]{24,}\b'),
    'lark-minute-id': re.compile(r'\bobcn[a-z0-9]{18,}\b'),
    'instance-id': re.compile(r'\b(?:app|bucket|cli)_[a-z0-9]{10,}\b'),
}

def files():
    # When Git is present, include ignored-but-tracked files in the audit too.
    if (ROOT / '.git').exists():
        result = subprocess.run(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=ROOT,capture_output=True,check=True)
        return sorted(set(ROOT / p.decode() for p in result.stdout.split(b'\0') if p))
    return sorted(p for p in ROOT.rglob('*') if p.is_file() and not (set(p.relative_to(ROOT).parts) & SKIP))

def scan(terms):
    issues=[];count=0
    for p in files():
        rel=str(p.relative_to(ROOT))
        if p.is_symlink(): issues.append({'file':rel,'rule':'symlink'});continue
        if p.name in {'.env','connection.json','invitation.json'} or '.private.' in p.name or p.suffix in {'.sqlite','.db','.log','.zip'}:
            issues.append({'file':rel,'rule':'private-or-generated-file'})
        if any(term.casefold() in rel.casefold() for term in terms): issues.append({'file':rel,'rule':'private-path-term'})
        count+=1
        if p.suffix.lower() in {'.png','.jpg','.jpeg','.webp','.ico'}: continue
        try: text=p.read_text(encoding='utf-8')
        except UnicodeError:
            issues.append({'file':rel,'rule':'unreviewed-binary'});continue
        for i,line in enumerate(text.splitlines(),1):
            for name,regex in RULES.items():
                if regex.search(line):issues.append({'file':rel,'line':i,'rule':name})
            if any(term.casefold() in line.casefold() for term in terms):issues.append({'file':rel,'line':i,'rule':'private-term'})
    return {'ok':not issues,'files':count,'issues':issues,'imageReview':'manual required'}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--terms-file',type=Path);a=p.parse_args()
    terms=[x.strip() for x in a.terms_file.read_text().splitlines() if x.strip()] if a.terms_file else []
    report=scan(terms);print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report['ok'] else 1)
