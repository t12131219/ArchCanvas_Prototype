/* Request identity and model epochs prevent stale background commits. */
(function(root){
  'use strict';
  function create({workerFactory,fallback}={}){
    let worker=null,unavailable=false,serial=0,epoch=0,value=null,ready=Promise.resolve(),fallbackRuntime=null;
    const pending=new Map();
    function stop(){if(worker)worker.terminate();worker=null;for(const {reject,timer}of pending.values()){clearTimeout(timer);reject(Error('后台画布不可用'));}pending.clear();}
    function ensure(){
      if(worker||unavailable)return worker;
      try{worker=workerFactory?workerFactory():new Worker('scene-worker.js?v=canvas-interaction-1');
        worker.onmessage=event=>{const job=pending.get(event.data.requestId);if(job){pending.delete(event.data.requestId);clearTimeout(job.timer);job.resolve(event.data);}};
        worker.onerror=worker.onmessageerror=()=>{unavailable=true;stop();};
      }catch(_){unavailable=true;worker=null;}return worker;
    }
    function send(task){return new Promise((resolve,reject)=>{
      const active=ensure();if(!active){reject(Error('后台画布不可用'));return;}
      const requestId=++serial,timer=setTimeout(()=>{unavailable=true;stop();reject(Error('后台画布超时'));},120000);
      pending.set(requestId,{resolve,reject,timer});try{active.postMessage({...task,requestId});}catch(error){pending.delete(requestId);clearTimeout(timer);reject(error);}
    });}
    async function local(task){
      // Let the busy indicator paint before the compatibility computation.
      await new Promise(resolve=>setTimeout(resolve,0));
      if(task.epoch!==epoch)return {ok:false,stale:true};
      if(!fallbackRuntime){fallbackRuntime=fallback?fallback():root.SemanticSceneRuntime.create();fallbackRuntime.run({task:'init',epoch,ir:value});}
      return structuredClone({...fallbackRuntime.run(task),execution:'main-fallback'});
    }
    function init(ir){value=ir;epoch++;fallbackRuntime=null;const current=epoch;
      // Discard a running model on switch rather than queueing behind it.
      stop();ready=send({task:'init',epoch:current,ir}).catch(()=>{if(current===epoch){unavailable=true;stop();}return null;});return current;
    }
    async function request(task){const current=epoch;await ready;if(current!==epoch)return {ok:false,stale:true};
      let result;try{result=await send({...task,epoch:current});result.execution='worker';}catch(_){result=await local({...task,epoch:current});}
      if(current!==epoch)return {ok:false,stale:true};return result;
    }
    return {init,request,dispose(){epoch++;stop();}};
  }
  const api={create};root.SemanticSceneClient=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
