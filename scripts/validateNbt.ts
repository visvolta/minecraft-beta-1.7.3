import { nbt, type NbtTag } from '../src/persistence/nbt/Nbt.ts'; import { decodeNbt, encodeNbt } from '../src/persistence/nbt/NbtCodec.ts';
function assert(v:boolean,m:string):void{if(!v)throw new Error(m);} const root=nbt.compound(new Map<string, NbtTag>([['z',nbt.long(-2n)],['a',nbt.string('hello')],['ints',nbt.ints(new Int32Array([1,-2]))],['list',nbt.list('byte',[nbt.byte(1),nbt.byte(2)])]]));const bytes=encodeNbt(root,'Data');const decoded=decodeNbt(bytes);assert(decoded.name==='Data','root name');assert([...decoded.root.value.keys()].join(',')==='z,a,ints,list','compound insertion order');assert(decodeNbt(bytes).root.value.get('z')?.type==='long','long');let failed=false;try{decodeNbt(bytes.slice(0,-1));}catch{failed=true;}assert(failed,'truncation rejected');console.log('NBT validation passed.');
// Known NBT fixture: named empty compound (TAG_Compound, name length 0, TAG_End).
const emptyFixture = new Uint8Array([10, 0, 0, 0]);
assert(decodeNbt(emptyFixture).root.value.size === 0, 'known empty compound fixture');
// Known NBT fixture: root "A" with TAG_Byte "x" = 127.
const byteFixture = new Uint8Array([10, 0, 1, 65, 1, 0, 1, 120, 127, 0]);
assert((decodeNbt(byteFixture).root.value.get('x') as { value: number }).value === 127, 'known byte fixture');
for (const malformed of [new Uint8Array([0]), new Uint8Array([10, 0, 0, 12]), new Uint8Array([10, 0, 0, 9, 99, 0, 0, 0, 0, 0])]) {
  let rejected = false; try { decodeNbt(malformed); } catch { rejected = true; } assert(rejected, 'malformed fixture rejected');
}
