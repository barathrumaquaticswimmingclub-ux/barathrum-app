'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const files=fs.readdirSync('.').filter(f=>f.endsWith('.js'));
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=path.join(dir,entry.name);if(entry.isDirectory())visit(name);else if(name.endsWith('.js'))files.push(name);}}
visit('public');
for(const file of files)new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
console.log('PASS JavaScript syntax: '+files.length+' server, test and browser files.');
