
window.DEMO_DOCS=__DOCS__;
(function(){const seed=__SEED__;
const me={id:'demo',name:'Максим (перегляд)',role:'owner',person_id:'maksym'};
const data={me,persons:seed.persons.map(p=>({...p,v:1,last:null})),unions:seed.unions.map((u,i)=>({id:'u'+i,...u})),families:seed.families,documents:seed.documents.map(d=>({...d,pages:d.pages.length})),photos:[],stories:[],names:{demo:'Максим'}};
const J=(o,s=200)=>Promise.resolve(new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}}));
const of=window.fetch.bind(window);
window.fetch=function(u,o={}){u=String(u);if(!u.startsWith('/api/'))return of(u,o);const b=o.body&&typeof o.body==='string'?JSON.parse(o.body):{};
 if(u.includes('a=status'))return J({initialized:true});if(u.includes('a=me'))return J({member:me});
 if(u.startsWith('/api/track'))return J({ok:true});
 if(u.startsWith('/api/data')&&(!o.method||o.method==='GET'))return J(JSON.parse(JSON.stringify(data)));
 if(u.startsWith('/api/data')){ if(b.op==='story.add'){const s={id:'s'+Date.now(),target:b.target,text:b.text,by:'demo',at:new Date().toISOString()};data.stories.push(s);return J({story:s})}
   if(b.op==='person.save'){let p;if(b.id){p=data.persons.find(x=>x.id===b.id);Object.assign(p,b.data,{last:{by:'demo',at:new Date().toISOString()}})}else{p={id:'p'+Date.now(),...b.data,v:1};data.persons.push(p);const l=b.link||{};if(l.parentOf){const c=data.persons.find(x=>x.id===l.parentOf);if(c)c[p.sex==='f'?'mo':'f']=p.id}if(l.spouseOf)data.unions.push({id:'u'+Date.now(),a:l.spouseOf,b:p.id,date:l.date||''})}return J({person:p})}
   if(b.op==='union.add'){const x={id:'u'+Date.now(),a:b.a,b:b.b,date:b.date||''};data.unions.push(x);return J({union:x})}
   if(b.op==='family.story'){data.families.find(f=>f.id===b.id).story=b.story;return J({ok:true})}
   return J({ok:true});}
 if(u.startsWith('/api/admin?a=stats'))return J({from:new Date(Date.now()-30*864e5).toISOString(),to:new Date().toISOString(),members:[{id:'demo',name:'Максим',role:'owner'},{id:'t',name:'Тетяна (приклад)',role:'editor'}],cur:{demo:{time:2700000,opens:34,views:12,days:5,sessions:6,edits:9,last:new Date().toISOString()},t:{time:1260000,opens:15,days:3,sessions:3,edits:2,last:new Date(Date.now()-86400000).toISOString()}},prev:{demo:{time:1500000,opens:20,edits:3}},top:[{key:'person:vasyl_t',label:'Василь Шутий',opens:9,time:780000,people:2},{key:'doc:d1848',label:'Народження Федора Микитовича',opens:6,time:420000,people:2}],daily:Object.fromEntries(Array.from({length:30},(_,i)=>[new Date(Date.now()-(29-i)*864e5).toISOString().slice(0,10),{demo:Math.round(Math.random()*12)*60000}])),views:{p:2400000,tree:900000,docs:500000,families:160000}});
 if(u.startsWith('/api/admin?a=members'))return J({members:[{id:'demo',email:'max@…',name:'Максим',role:'owner',active:true,sessions:{n:2,last:new Date().toISOString(),devices:[]}}],invites:[]});
 if(u.startsWith('/api/admin?a=revisions'))return J({revisions:[]});
 if(u.startsWith('/api/admin?a=invite'))return J({link:'https://shutyi.com.ua/?invite=приклад-посилання'});
 if(u.startsWith('/api/upload'))return J({error:'demo'},400);
 return J({ok:true});};})();
