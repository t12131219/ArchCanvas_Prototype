#!/usr/bin/env python3
"""Serve the existing editor plus a loopback-only, no-execution source analysis API."""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from analyze import analyze, AdapterError

ROOT=Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path!='/api/source-adapter/analyze':
            self.send_error(404);return
        origin=self.headers.get('Origin')
        if origin and urlsplit(origin).netloc!=self.headers.get('Host'):
            self.send_error(403,'Same-origin request required');return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=4_000_000:raise AdapterError('请求大小必须小于 4 MB。')
            payload=json.loads(self.rfile.read(length))
            result=analyze(payload.get('files'),payload.get('entry'),payload.get('config'))
            self.reply(200,result)
        except (ValueError,TypeError,RecursionError,AttributeError) as e:
            self.reply(400,{'error':str(e)})

    def reply(self,status,payload):
        data=json.dumps(payload,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)))
        self.end_headers();self.wfile.write(data)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=8766)
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(ROOT)))
    print(f'Summary Merge + Source Adapter: http://127.0.0.1:{args.port}/yworks_edge_router_lab/index.html',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()
