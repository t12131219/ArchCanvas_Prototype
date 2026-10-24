#!/usr/bin/env python3
"""Loopback static server plus bounded, non-executing source extraction API."""
import argparse
import json
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def allowed(self):
        origin=self.headers.get('Origin')
        host=urlparse(origin).hostname if origin else None
        return not origin or (host in {'127.0.0.1','localhost','::1'} and urlparse(origin).scheme=='http')
    def end_headers(self):
        if self.allowed() and self.headers.get('Origin'):
            self.send_header('Access-Control-Allow-Origin',self.headers['Origin']);self.send_header('Vary','Origin')
        self.send_header('Cache-Control','no-store')
        super().end_headers()
    def reply(self,status,value):
        body=json.dumps(value,ensure_ascii=False).encode();self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_OPTIONS(self):
        if not self.allowed():return self.reply(403,{'error':'Only local workspace origins are accepted'})
        self.send_response(204);self.send_header('Access-Control-Allow-Headers','Content-Type');self.send_header('Access-Control-Allow-Methods','POST, OPTIONS');self.end_headers()
    def do_GET(self):
        if self.path=='/api/authoring/health':return self.reply(200,{'ok':True,'static_only':True})
        super().do_GET()
    def do_POST(self):
        if self.path not in {'/api/authoring/compile','/api/authoring/certify'}:return self.reply(404,{'error':'Unknown endpoint'})
        if not self.allowed():return self.reply(403,{'error':'Only local workspace origins are accepted'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            limit=30_000_000 if self.path.endswith('/certify') else 180_000
            if not 0<length<=limit:raise ValueError('请求超过大小限制')
            payload=json.loads(self.rfile.read(length));payload['_operation']='certify' if self.path.endswith('/certify') else 'compile'
            # Parsing arbitrary source has bounded CPU/memory and never shares
            # mutable analyzer globals with another browser request.
            result=subprocess.run([sys.executable,str(Path(__file__).resolve()),'--compile-worker'],input=json.dumps(payload),text=True,capture_output=True,timeout=25,cwd=ROOT)
            value=json.loads(result.stdout)
            self.reply(200 if value.get('ok') else 422,value)
        except (ValueError,json.JSONDecodeError,subprocess.TimeoutExpired) as error:self.reply(422,{'ok':False,'error':str(error)})

if __name__=='__main__':
    if '--compile-worker' in sys.argv:
        import resource
        resource.setrlimit(resource.RLIMIT_AS,(768*1024*1024,768*1024*1024));resource.setrlimit(resource.RLIMIT_CPU,(20,20))
        from semantic_adapter.authoring import compile_module, certify_assembly
        try:
            p=json.load(sys.stdin)
            value={'ir':certify_assembly(p['ir'])} if p.get('_operation')=='certify' else {'module':compile_module(p['source'],p['entry'],p.get('constructor'))}
            print(json.dumps({'ok':True,**value},ensure_ascii=False))
        except Exception as error:print(json.dumps({'ok':False,'error':str(error)},ensure_ascii=False))
    else:
        parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8767);args=parser.parse_args()
        print(f'http://127.0.0.1:{args.port}/semantic_studio/index.html',flush=True)
        ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
