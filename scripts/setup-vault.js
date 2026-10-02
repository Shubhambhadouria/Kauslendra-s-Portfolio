import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createVault } from '../vault.js';

const vault=await createVault(fileURLToPath(new URL('../.vault/',import.meta.url)));
if(vault.hasAdmin()){console.error('The vault already has an administrator. Sign in to manage viewer access.');process.exit(1);}
let hidden=false;
const output=new Writable({write(chunk,encoding,callback){if(!hidden)process.stdout.write(chunk);callback();}});
const prompt=createInterface({input:process.stdin,output,terminal:true});
try{
  process.stdout.write('Admin password (12+ characters; hidden): ');hidden=true;const password=await prompt.question('');hidden=false;process.stdout.write('\n');
  process.stdout.write('Confirm password (hidden): ');hidden=true;const confirmation=await prompt.question('');hidden=false;process.stdout.write('\n');
  if(password!==confirmation)throw Error('Passwords did not match.');
  process.stdout.write('Shared viewer password (12+ characters; hidden): ');hidden=true;const sharedPassword=await prompt.question('');hidden=false;process.stdout.write('\n');
  process.stdout.write('Confirm shared password (hidden): ');hidden=true;const sharedConfirmation=await prompt.question('');hidden=false;process.stdout.write('\n');
  if(sharedPassword!==sharedConfirmation)throw Error('Shared passwords did not match.');
  if(sharedPassword===password)throw Error('Use different officer and shared viewer passwords.');
  if(sharedPassword.length<12||sharedPassword.length>256)throw Error('Shared password must be 12–256 characters.');
  await vault.createUser('officer',password,'admin');await vault.createUser('vault',sharedPassword,'viewer');console.log('Fire Vault passwords configured. Restart the server, then sign in through Fire Vault.');
}catch(error){hidden=false;console.error(error.message);process.exitCode=1;}finally{prompt.close();}
