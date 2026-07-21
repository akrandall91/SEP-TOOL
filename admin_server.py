#!/usr/bin/env python3
"""Local-only authenticated proposal console for SEP data review.

This is deliberately not built into the public static site. It binds to 127.0.0.1,
keeps sessions in memory, and stages proposed edits in data/review-proposals.json.
"""
import getpass, hashlib, hmac, html, json, os, re, secrets, tempfile
from datetime import datetime, timezone
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT=Path(__file__).resolve().parent
PROPOSALS=ROOT/'data'/'review-proposals.json'
DEPARTMENTS=ROOT/'data'/'departments.json'
SESSIONS={}
PASSWORD_HASH=b''
MAX_BODY=64_000

STYLE="""*{box-sizing:border-box}body{margin:0;background:#f4f7f5;color:#14262b;font:16px/1.55 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:3rem 1rem}header{display:flex;justify-content:space-between;align-items:center;gap:1rem;border-bottom:1px solid #cad7d3;padding-bottom:1.2rem}h1{font-size:clamp(2rem,6vw,4.5rem);line-height:1;letter-spacing:-.05em}h2{margin-top:0}form,.panel{background:#fff;border:1px solid #cad7d3;padding:1.25rem;margin:1.5rem 0;box-shadow:0 18px 50px #19352c12}.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}label{display:grid;gap:.35rem;font-weight:700}input,select,textarea,button{font:inherit;padding:.75rem;border:1px solid #9eb2ac;background:#fff}textarea{min-height:7rem;resize:vertical}.wide{grid-column:1/-1}button{background:#11645a;color:#fff;border-color:#11645a;font-weight:800;cursor:pointer}.quiet{background:transparent;color:#14262b}.notice{border-left:4px solid #d69a13;padding:.75rem 1rem;background:#fff8df}.success{border-color:#25815d;background:#eaf8f0}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #dfe8e5;padding:.7rem}.meta{color:#5e716c;font-size:.86rem}@media(max-width:700px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}.table{overflow:auto}header{align-items:flex-start}}"""

def load_json(path): return json.loads(path.read_text(encoding='utf-8'))
def goal_options():
    rows=[]
    for dept in load_json(DEPARTMENTS).get('departments',[]):
        for goal in dept.get('goals',[]): rows.append((goal['id'],f"{goal['id']} - {dept['name']}: {goal['text']}"))
    return rows
def password_digest(value): return hashlib.scrypt(value.encode(),salt=b'sep-local-admin-v1',n=2**14,r=8,p=1)
def page(title,body):
    return f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title><style>{STYLE}</style></head><body><main>{body}</main></body></html>'

class Handler(BaseHTTPRequestHandler):
    server_version='SEPReview/1.0'
    def log_message(self,fmt,*args): print(f"[{self.log_date_time_string()}] {fmt%args}")
    def headers_secure(self,ctype='text/html; charset=utf-8'):
        self.send_header('Content-Type',ctype);self.send_header('Cache-Control','no-store');self.send_header('X-Frame-Options','DENY');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer');self.send_header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
    def respond(self,status,content):
        body=content.encode();self.send_response(status);self.headers_secure();self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def redirect(self,path,cookie=None):
        self.send_response(303);self.headers_secure();self.send_header('Location',path)
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers()
    def session(self):
        jar=cookies.SimpleCookie(self.headers.get('Cookie',''));token=jar.get('sep_session');return SESSIONS.get(token.value) if token else None
    def fields(self):
        length=int(self.headers.get('Content-Length','0'))
        if length>MAX_BODY: raise ValueError('Request is too large.')
        return {k:v[0] for k,v in parse_qs(self.rfile.read(length).decode('utf-8'),keep_blank_values=True).items()}
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/': return self.redirect('/admin' if self.session() else '/login')
        if path=='/login':
            if self.session(): return self.redirect('/admin')
            return self.respond(200,page('SEP review login','<p class="meta">Private local tool</p><h1>SEP review console</h1><p class="notice">This console only listens on this computer. Proposed edits are staged for review and do not change public classifications automatically.</p><form method="post" action="/login"><label>Password<input type="password" name="password" required autofocus autocomplete="current-password"></label><p><button>Sign in</button></p></form>'))
        if path=='/admin':
            session=self.session()
            if not session:return self.redirect('/login')
            data=load_json(PROPOSALS);opts=''.join(f'<option value="{html.escape(g)}">{html.escape(label)}</option>' for g,label in goal_options())
            rows=''.join(f"<tr><th>{html.escape(str(p.get('goalId','')))}</th><td>{html.escape(str(p.get('proposalType','')))}</td><td>{html.escape(str(p.get('field','')))}</td><td>{html.escape(str(p.get('proposedValue','')))}</td><td>{html.escape(str(p.get('proposedBy','')))}</td><td>{html.escape(str(p.get('proposedAt','')))}</td></tr>" for p in reversed(data.get('proposals',[]))) or '<tr><td colspan="6">No proposals staged yet.</td></tr>'
            body=f'''<header><div><p class="meta">Local-only workspace</p><h2>SEP review console</h2></div><form method="post" action="/logout"><input type="hidden" name="csrf" value="{session['csrf']}"><button class="quiet">Sign out</button></form></header><h1>Point the evidence to the right place.</h1><p class="notice">Nothing submitted here changes the public site. Each item enters the existing proposal queue for evidence review and later promotion.</p><form method="post" action="/proposals"><input type="hidden" name="csrf" value="{session['csrf']}"><div class="grid"><label>Goal<select name="goalId" required>{opts}</select></label><label>Proposal type<select name="proposalType"><option>new source</option><option>correction</option><option>milestone</option><option>funding link</option><option>collaboration link</option><option>reporting gap</option></select></label><label>Field or destination<input name="field" required placeholder="statusHistory, funding link, collaboration..."></label><label>Proposed by<input name="proposedBy" required autocomplete="name"></label><label class="wide">Proposed value or pointer<textarea name="proposedValue" required></textarea></label><label class="wide">Why this belongs here<textarea name="reason" required></textarea></label><label class="wide">Public source URL<input type="url" name="sourceUrl" required placeholder="https://..."></label></div><p><button>Stage for review</button></p></form><section class="panel"><h2>Proposal queue</h2><div class="table"><table><thead><tr><th>Goal</th><th>Type</th><th>Destination</th><th>Proposed value</th><th>By</th><th>Created</th></tr></thead><tbody>{rows}</tbody></table></div></section>'''
            return self.respond(200,page('SEP review console',body))
        self.respond(404,page('Not found','<h1>Not found</h1>'))
    def do_POST(self):
        path=urlparse(self.path).path
        try: fields=self.fields()
        except ValueError as exc:return self.respond(413,page('Request rejected',f'<h1>{html.escape(str(exc))}</h1>'))
        if path=='/login':
            supplied=password_digest(fields.get('password',''))
            if not hmac.compare_digest(supplied,PASSWORD_HASH):return self.respond(401,page('Sign in failed','<h1>Sign in failed</h1><p>That password was not accepted.</p><p><a href="/login">Try again</a></p>'))
            token=secrets.token_urlsafe(32);SESSIONS[token]={'csrf':secrets.token_urlsafe(24)}
            return self.redirect('/admin',f'sep_session={token}; HttpOnly; SameSite=Strict; Path=/')
        session=self.session()
        if not session:return self.redirect('/login')
        if not hmac.compare_digest(fields.get('csrf',''),session['csrf']):return self.respond(403,page('Request rejected','<h1>Request rejected</h1><p>The form token was invalid. Reload and try again.</p>'))
        if path=='/logout':
            jar=cookies.SimpleCookie(self.headers.get('Cookie',''));token=jar.get('sep_session')
            if token:SESSIONS.pop(token.value,None)
            return self.redirect('/login','sep_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/')
        if path=='/proposals':
            required=('goalId','proposalType','field','proposedValue','reason','sourceUrl','proposedBy')
            if any(not fields.get(k,'').strip() for k in required):return self.respond(400,page('Missing information','<h1>Complete every field.</h1><p><a href="/admin">Return to the form</a></p>'))
            valid={g for g,_ in goal_options()}
            if fields['goalId'] not in valid:return self.respond(400,page('Invalid goal','<h1>The selected goal does not exist.</h1>'))
            source=urlparse(fields['sourceUrl'])
            if source.scheme not in ('http','https') or not source.netloc:return self.respond(400,page('Invalid source','<h1>Use a public http(s) source URL.</h1>'))
            record={"id":f"proposal-{datetime.now(timezone.utc):%Y%m%d}-{secrets.token_hex(3)}","goalId":fields['goalId'],"proposalType":fields['proposalType'][:80],"field":fields['field'][:160],"proposedValue":fields['proposedValue'][:4000],"reason":fields['reason'][:4000],"sourceUrl":fields['sourceUrl'][:1500],"proposedBy":fields['proposedBy'][:160],"proposedAt":datetime.now(timezone.utc).isoformat(),"status":"pending"}
            data=load_json(PROPOSALS);data.setdefault('proposals',[]).append(record)
            fd,tmp=tempfile.mkstemp(prefix='review-proposals-',suffix='.json',dir=PROPOSALS.parent);os.close(fd)
            try: Path(tmp).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8');os.replace(tmp,PROPOSALS)
            finally:
                if os.path.exists(tmp):os.unlink(tmp)
            return self.redirect('/admin')
        self.respond(404,page('Not found','<h1>Not found</h1>'))

def main():
    global PASSWORD_HASH
    password=os.environ.get('SEP_ADMIN_PASSWORD') or getpass.getpass('Create local SEP admin password: ')
    if len(password)<10:raise SystemExit('Use a password of at least 10 characters.')
    PASSWORD_HASH=password_digest(password);port=int(os.environ.get('SEP_ADMIN_PORT','8766'))
    print(f'Private SEP review console: http://127.0.0.1:{port}/login')
    print('Bound to localhost only. Press Ctrl+C to stop.')
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
if __name__=='__main__':main()
