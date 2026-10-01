import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {handle} from './app.js';
const root=process.env.DATA_DIR||'data';await mkdir(root+'/blobs',{recursive:true});
const db=new DatabaseSync(root+'/album.sqlite');db.exec(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
const DB={prepare(sql){return {bind(...args){const s=db.prepare(sql);return {async first(col){const r=s.get(...args);return col?r?.[col]:r},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}}}}}};
let FILES={async put(key,data,opt){const id=key.replace('album/','').replace('preview/','preview-');if(!/^(preview-)?[a-f0-9]{32}$/.test(id))throw Error('bad key');await writeFile(root+'/blobs/'+id,Buffer.from(data));await writeFile(root+'/blobs/'+id+'.json',JSON.stringify(opt.httpMetadata))},async head(key){const id=key.replace('album/','').replace('preview/','preview-');if(!/^(preview-)?[a-f0-9]{32}$/.test(id))return null;try{return {size:(await stat(root+'/blobs/'+id)).size}}catch{return null}},async get(key,opt){const id=key.replace('album/','').replace('preview/','preview-');if(!/^(preview-)?[a-f0-9]{32}$/.test(id))return null;try{return {body:await readFile(root+'/blobs/'+id).then(b=>opt?.range?b.subarray(opt.range.offset,opt.range.offset+opt.range.length):b),httpMetadata:JSON.parse(await readFile(root+'/blobs/'+id+'.json','utf8'))}}catch{return null}}};
if(process.env.LOCAL_STORAGE==='r2'){
 const {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand}=await import('@aws-sdk/client-s3');
 const endpoint=process.env.R2_ENDPOINT_URL;
 if(!/^https:\/\/[a-z0-9]+\.r2\.cloudflarestorage\.com$/.test(endpoint||''))throw Error('Bad R2 endpoint');
 const s3=new S3Client({region:'auto',endpoint,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
 FILES={async put(key,data,opt){await s3.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET,Key:key,Body:Buffer.from(data),ContentType:opt.httpMetadata.contentType}))},async head(key){try{const o=await s3.send(new HeadObjectCommand({Bucket:process.env.R2_BUCKET,Key:key}));return {size:o.ContentLength}}catch(err){if(err.name==='NotFound')return null;throw err}},async get(key,opt){try{const o=await s3.send(new GetObjectCommand({Bucket:process.env.R2_BUCKET,Key:key,...(opt?.range?{Range:`bytes=${opt.range.offset}-${opt.range.offset+opt.range.length-1}`}:{})}));return {body:await o.Body.transformToByteArray(),httpMetadata:{contentType:o.ContentType}}}catch(err){if(err.name==='NoSuchKey')return null;throw err}}};
}
const env={...process.env,DB,FILES};
createServer(async(req,res)=>{try{const init={method:req.method,headers:req.headers};if(!['GET','HEAD'].includes(req.method)){init.body=Readable.toWeb(req);init.duplex='half'}const out=await handle(new Request((env.PUBLIC_URL||'http://localhost:8080')+req.url,init),env);res.writeHead(out.status,Object.fromEntries(out.headers));if(out.body)Readable.fromWeb(out.body).pipe(res);else res.end()}catch{res.writeHead(500);res.end('failed')}}).listen(Number(process.env.PORT||8080),process.env.HOST||'127.0.0.1',()=>console.log('Album web ready'));
