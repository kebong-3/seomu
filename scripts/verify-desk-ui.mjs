import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {createServer}=await import(require.resolve('vite'));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const ExcelJS=require('exceljs');
const server=await createServer({root:new URL('../frontend',import.meta.url).pathname,server:{host:'127.0.0.1',port:5178}});await server.listen();
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const dir=process.env.DESK_TEST_OUTPUT||'/tmp/seomu-desk-ui';await fs.mkdir(dir,{recursive:true});
try {
 await page.goto('http://127.0.0.1:5178');
 if(process.env.DESK_TEST_FONT){const font=await fs.readFile(process.env.DESK_TEST_FONT);await page.addStyleTag({content:`@font-face{font-family:DeskTest;src:url(data:font/woff2;base64,${font.toString('base64')})}body,button,input,textarea,select{font-family:DeskTest,sans-serif!important}`});await page.evaluate(()=>document.fonts.ready);}
 const nav=async label=>{await page.locator('.portal-sidebar nav').getByRole('button',{name:label,exact:true}).click();};
 const download=async label=>{const p=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const d=await p;const path=dir+'/'+d.suggestedFilename();await d.saveAs(path);return path;};
 await nav('서무 실무 안내');await page.getByRole('heading',{name:'서무 실무 안내',exact:true}).waitFor();
 assert.equal(await page.locator('.desk-book-list button').count(),16);
 await page.getByLabel('업무명·기준기간',{exact:true}).fill('가상 10월 취합');
 await page.getByLabel('담당자가 정한 마감',{exact:true}).fill('2026-10-30');
 const template=await download('취합 양식 XLSX');let wb=new ExcelJS.Workbook();await wb.xlsx.readFile(template);assert.equal(wb.worksheets[0].getCell('A1').value,'대상코드');
 await page.getByRole('button',{name:'업무 체크리스트 등록',exact:true}).click();
 await nav('업무·반복 일정');assert.match(await page.locator('.portal-content').innerText(),/여러 부서의 엑셀 취합/);
 await nav('서무 실무 안내');await page.getByRole('button',{name:'내 문서에서 기관 기준 찾기',exact:true}).click();
 // Server is optional; prefilled query remains in component even if connection prompt is shown.
 await nav('엑셀 취합·대조');await page.getByRole('button',{name:'가상자료로 체험',exact:true}).click();assert.match(await page.locator('.portal-content>div:not([hidden])').innerText(),/DEMO-03/);
 const merged=await download('결과 XLSX 저장');wb=new ExcelJS.Workbook();await wb.xlsx.readFile(merged);assert.equal(wb.worksheets.length,4);assert.equal(wb.getWorksheet('전체취합').rowCount,4);assert.equal(wb.getWorksheet('미회신후보').getCell('A2').value,'DEMO-03');
 await nav('오늘');await nav('엑셀 취합·대조');assert.match(await page.locator('.desk-metrics:visible').innerText(),/3행/);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:dir+'/merge-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'불러온 자료 비우기',exact:true}).click();
 // Genuine file upload from exported workbook, not just fixtures in the UI.
 await page.locator('input[aria-label="취합 파일 선택"]:visible').setInputFiles(template);
 await page.getByText('서식없음',{exact:true}).count();
 await page.locator('.desk-grid-config:visible').first().waitFor();
 await nav('승인·실적 파일 연결');await page.getByRole('button',{name:'가상자료로 체험',exact:true}).click();assert.match(await page.locator('.portal-content').innerText(),/실적자료 없음/);
 const pair=await download('연결결과·후속 입력양식 XLSX');wb=new ExcelJS.Workbook();await wb.xlsx.readFile(pair);assert.equal(wb.getWorksheet('연결결과').rowCount,4);assert.equal(wb.getWorksheet('매식검토입력').rowCount,2);
 await nav('초근·매식비 점검');await page.getByRole('button',{name:'가상자료로 체험',exact:true}).click();assert.match(await page.locator('.desk-metrics:visible').innerText(),/2행/);
 const meal=await download('검토자료 XLSX 저장');wb=new ExcelJS.Workbook();await wb.xlsx.readFile(meal);assert.equal(wb.getWorksheet('개인별대조').getCell('M2').value,160);assert.equal(wb.getWorksheet('보완필요').rowCount,3);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:dir+'/meal-desktop.png',fullPage:true});
 for(const label of ['서무 실무 안내','엑셀 취합·대조','승인·실적 파일 연결','초근·매식비 점검']){await nav(label);await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' mobile overflow');await page.setViewportSize({width:1440,height:1000});}
 await nav('서무 실무 안내');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:dir+'/guide-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:dir+'/guide-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: 16 guides, workflow registration, XLSX templates/import/output, merge missing/duplicate, approval/actual match, meal review, in-session retention, 1440/390px layouts. Synthetic data only.');
}finally{await browser.close();await server.close();}
