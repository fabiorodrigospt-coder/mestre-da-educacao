"""Create only the ten explicitly named QA identities. Never resets existing users."""
import json,os,secrets,urllib.request,urllib.error,re,time
from pathlib import Path
root=Path(__file__).resolve().parent.parent
out=root/'.bots-credentials.json'
if out.exists():
    accounts=json.loads(out.read_text())
else:
    batch=secrets.token_hex(4)
    accounts=[dict(email=f'bot-qa-{batch}-{i:02d}@example.com',password=secrets.token_urlsafe(32),intelligence=round(.2+secrets.randbelow(76)/100,2),display_name=f'[BOT QA] {i:02d}') for i in range(1,11)]
    out.write_text(json.dumps(accounts));out.chmod(0o600)
config=(root/'config.js').read_text();key=re.search(r"supabasePublishableKey: '([^']+)'",config)[1]
base='https://wsxmrysizwetxxshxwan.supabase.co'
for i,b in enumerate(accounts):
    if b.get('id'):continue
    req=urllib.request.Request(base+'/auth/v1/signup',data=json.dumps({'email':b['email'],'password':b['password'],'data':{'display_name':b['display_name']}}).encode(),headers={'apikey':key,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=25) as r:data=json.load(r)
        if not data.get('access_token') or not data.get('user',{}).get('id'):raise RuntimeError('Signup did not return an authenticated user')
        b['id']=data['user']['id'];out.write_text(json.dumps(accounts));print(f'BOT {i+1:02d}: created',flush=True)
    except urllib.error.HTTPError as e:
        print(f'BOT {i+1:02d}: HTTP {e.code}; provisioning stopped',flush=True);raise SystemExit(1)
    time.sleep(1)
print('Ten QA accounts provisioned; credentials remain local and excluded from git.')
