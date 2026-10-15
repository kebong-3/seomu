import {parseDelimited} from './table-engine';
export type TableSheet={name:string;rows:string[][]};
export async function readTables(file:File):Promise<TableSheet[]> {
 if(file.size>8*1024*1024)throw Error('파일당 8MB 이하로 나누어 주세요.');
 const buffer=await file.arrayBuffer();
 if(/\.(csv|tsv|txt)$/i.test(file.name)){let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('euc-kr').decode(buffer);}const rows=parseDelimited(text);checkLimits(rows);return [{name:'텍스트',rows}];}
 if(!/\.xlsx$/i.test(file.name))throw Error('XLSX·CSV·TSV만 지원합니다. XLS·암호 파일은 Excel에서 XLSX로 다시 저장하세요.');
 // Inspect ZIP directory sizes before decompression. Never run formulas or embedded content.
 const view=new DataView(buffer);let total=0,entries=0;
 for(let i=0;i+46<=buffer.byteLength;i++){if(view.getUint32(i,true)!==0x02014b50)continue;const size=view.getUint32(i+24,true),nl=view.getUint16(i+28,true),el=view.getUint16(i+30,true),cl=view.getUint16(i+32,true);if(i+46+nl+el+cl>buffer.byteLength)throw Error('손상된 XLSX 압축 구조입니다.');const name=new TextDecoder().decode(new Uint8Array(buffer,i+46,nl));if(/vbaProject|externalLinks|embeddings/i.test(name))throw Error('매크로·외부 연결·포함 개체가 있습니다. 필요한 값을 새 XLSX에 붙여넣어 주세요.');total+=size;entries++;if(total>40*1024*1024||entries>3000)throw Error('압축 해제 크기가 큽니다. 시트를 나누어 주세요.');i+=45+nl+el+cl;}
 if(!entries)throw Error('정상 XLSX 파일이 아닙니다.');
 const ExcelJS=(await import('exceljs')).default;const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);
 if(wb.worksheets.length>20)throw Error('시트는 파일당 20개까지 읽습니다. 필요한 시트만 저장하세요.');
 const tables:TableSheet[]=[];
 for(const s of wb.worksheets){if(s.state!=='visible')continue;if(s.rowCount>10001||s.columnCount>50)throw Error(`${s.name}: 10,000개 자료행·50열 이하로 정리하세요.`);const rows:string[][]=[];
  for(let r=1;r<=s.rowCount;r++){const cells:string[]=[];for(let c=1;c<=s.columnCount;c++){const cell=s.getCell(r,c);if(cell.type===ExcelJS.ValueType.Formula)throw Error(`${s.name} ${cell.address}: 수식이 있습니다. 값으로 붙여넣은 파일을 사용하세요.`);if(cell.type===ExcelJS.ValueType.Error)throw Error(`${s.name} ${cell.address}: 오류 셀이 있습니다.`);const value=cell.value;cells.push(value instanceof Date?(value.getUTCFullYear()<1901?value.toISOString().slice(11,16):value.toISOString().slice(11,19)==='00:00:00'?value.toISOString().slice(0,10):value.toISOString().slice(0,16).replace('T',' ')):cell.text);}rows.push(cells);}checkLimits(rows);tables.push({name:s.name,rows});
 }
 if(!tables.length)throw Error('읽을 수 있는 표시 시트가 없습니다.');return tables;
}
function checkLimits(rows:string[][]){if(rows.length>10001||rows.some(r=>r.length>50||r.some(c=>c.length>20000)))throw Error('10,000개 자료행·50열·셀당 20,000자 이내로 나누어 주세요.');}
export async function workbookBlob(sheets:{name:string;rows:(string|number)[][]}[]){const ExcelJS=(await import('exceljs')).default;const wb=new ExcelJS.Workbook();wb.creator='서구 펀온워크 AIBLE팀';for(const {name,rows} of sheets){const s=wb.addWorksheet(name.slice(0,31));rows.forEach(r=>s.addRow(r));s.views=[{state:'frozen',ySplit:1}];s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF344C78'}};s.columns.forEach(c=>{c.width=24;});s.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length),column:Math.max(1,rows[0]?.length||1)}};}const bytes=await wb.xlsx.writeBuffer();return new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
export async function exportWorkbook(name:string,sheets:{name:string;rows:(string|number)[][]}[]){const blob=await workbookBlob(sheets);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
