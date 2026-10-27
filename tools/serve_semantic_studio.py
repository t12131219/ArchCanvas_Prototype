#!/usr/bin/env python3
"""Loopback source extraction API and explicitly requested isolated CPU probes."""
import argparse
import json
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
PROBE_SLOT=threading.BoundedSemaphore(1)

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
        if self.path=='/api/authoring/health':return self.reply(200,{'ok':True,'static_only':False,'cpu_probe':'explicit-isolated'})
        super().do_GET()
    def do_POST(self):
        if self.path not in {'/api/authoring/compile','/api/authoring/certify','/api/authoring/probe'}:return self.reply(404,{'error':'Unknown endpoint'})
        if not self.allowed():return self.reply(403,{'error':'Only local workspace origins are accepted'})
        probe=self.path.endswith('/probe');acquired=False
        try:
            length=int(self.headers.get('Content-Length','0'))
            limit=30_000_000 if probe or self.path.endswith('/certify') else 180_000
            if not 0<length<=limit:raise ValueError('请求超过大小限制')
            payload=json.loads(self.rfile.read(length))
            if not isinstance(payload,dict):raise ValueError('请求必须是 JSON 对象')
            if probe:
                if payload.get('execute') is not True:raise ValueError('需要明确请求运行 CPU 探针')
                acquired=PROBE_SLOT.acquire(blocking=False)
                if not acquired:return self.reply(409,{'ok':False,'error':'已有 CPU 探针运行中，请稍后重试'})
            payload['_operation']='probe' if probe else 'certify' if self.path.endswith('/certify') else 'compile'
            # Parsing arbitrary source has bounded CPU/memory and never shares
            # mutable analyzer globals with another browser request.
            result=subprocess.run([sys.executable,str(Path(__file__).resolve()),'--compile-worker'],input=json.dumps(payload),text=True,capture_output=True,timeout=210 if probe else 25,cwd=ROOT)
            value=json.loads(result.stdout)
            self.reply(200 if value.get('ok') else 422,value)
        except (ValueError,json.JSONDecodeError,subprocess.TimeoutExpired) as error:self.reply(422,{'ok':False,'error':str(error)})
        finally:
            if acquired:PROBE_SLOT.release()

if __name__=='__main__':
    if '--compile-worker' in sys.argv:
        import resource
        from semantic_adapter.authoring import compile_module, certify_assembly
        try:
            p=json.load(sys.stdin)
            probe=p.get('_operation')=='probe'
            resource.setrlimit(resource.RLIMIT_AS,((10*1024 if probe else 768)*1024*1024,)*2)
            resource.setrlimit(resource.RLIMIT_CPU,(200 if probe else 20,)*2)
            if probe:
                from semantic_adapter.probe_assistance import assist
                if p.get('execute') is not True:raise ValueError('需要明确请求运行 CPU 探针')
                value=assist(p['ir'],p['interpreter'],p['source_root'],p['spec'],p.get('timeout',45))
            else:value={'ir':certify_assembly(p['ir'])} if p.get('_operation')=='certify' else {'module':compile_module(p['source'],p['entry'],p.get('constructor'))}
            print(json.dumps({'ok':True,**value},ensure_ascii=False))
        except Exception as error:print(json.dumps({'ok':False,'error':str(error)},ensure_ascii=False))
    else:
        parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8767);args=parser.parse_args()
        print(f'http://127.0.0.1:{args.port}/semantic_studio/index.html',flush=True)
        ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
