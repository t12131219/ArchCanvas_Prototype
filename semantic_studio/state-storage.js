/* Large manual layouts belong in IndexedDB; localStorage remains a migration
 * source and a compatibility fallback. Resolve writes only on transaction commit. */
(function(root){
  'use strict';
  function create(options={}){
    const safe=name=>{try{return root[name];}catch(_){return null;}},indexedDB='indexedDB' in options?options.indexedDB:safe('indexedDB'),localStorage='localStorage' in options?options.localStorage:safe('localStorage');
    let opening=null;
    function database(){
      if(!opening)opening=new Promise((resolve,reject)=>{
        if(!indexedDB){reject(Error('IndexedDB unavailable'));return;}
        const request=indexedDB.open('archcanvas-semantic-state',1);
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('states'))request.result.createObjectStore('states');};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
        request.onerror=()=>{opening=null;reject(request.error||Error('IndexedDB open failed'));};
        request.onblocked=()=>{opening=null;reject(Error('IndexedDB blocked'));};
      });return opening;
    }
    async function read(key){
      try{
        const db=await database(),text=await new Promise((resolve,reject)=>{
          const transaction=db.transaction('states','readonly'),request=transaction.objectStore('states').get(key);let value;
          request.onsuccess=()=>{value=request.result;};transaction.oncomplete=()=>resolve(value);transaction.onerror=transaction.onabort=()=>reject(transaction.error||Error('IndexedDB read failed'));
        });if(text)return JSON.parse(text);
      }catch(_){}
      try{return JSON.parse(localStorage?.getItem(key)||'null');}catch(_){return null;}
    }
    async function write(key,text){
      try{
        const db=await database();await new Promise((resolve,reject)=>{
          const transaction=db.transaction('states','readwrite');transaction.objectStore('states').put(text,key);
          transaction.oncomplete=resolve;transaction.onerror=transaction.onabort=()=>reject(transaction.error||Error('IndexedDB write failed'));
        });return {backend:'indexeddb'};
      }catch(error){
        if(!localStorage)throw error;localStorage.setItem(key,text);return {backend:'localstorage'};
      }
    }
    return {read,write};
  }
  const api={create};root.SemanticStateStorage=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
