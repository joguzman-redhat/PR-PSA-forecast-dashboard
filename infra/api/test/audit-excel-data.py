#!/usr/bin/env python3
"""Read-only reconciliation of XLSX cached source values and running forecast API.
Requires openpyxl; writes private JSON/CSV/HTML evidence, never workbook/DB changes.
Run: python infra/api/test/audit-excel-data.py --out /tmp/forecast-audit
"""
import argparse, collections, csv, datetime, hashlib, html, json, math, os, re, unicodedata, urllib.request
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[3]
MONTHS = 'Enero Febrero Marzo Abril Mayo Junio Julio Agosto Septiembre Octubre Noviembre Diciembre'.split()
BAD = {'', '#n/a', 'n/a', 'na', '#ref!', '#value!', '#div/0!', '#name?', '#num!'}
def text(v):
    if v is None: return ''
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return str(v).strip()
def valid(v): return text(v).lower() not in BAD
def norm(v): return ' '.join(text(v).split()).upper()
def number(v):
    if isinstance(v, bool) or not valid(v): return None
    try:
        n = float(v)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError): return None
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def slug(v): return re.sub('[^a-z0-9]', '', unicodedata.normalize('NFKD', text(v)).encode('ascii','ignore').decode().lower())

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);ap.add_argument('--base',default='http://localhost:3000');args=ap.parse_args()
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(out,0o700)
    result={'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_policy':'Cached XLSX values, independent column lookup, BackLog NOLA financials; tolerance USD 0.01. No recalculation, ETL or database writes.','sources':{},'checks':{},'issues':[],'source_warnings':[],'metrics':{}}
    def check(group, expected, actual, year='', key='', cell='', field=''):
        stats=result['checks'].setdefault(group,{'total':0,'passed':0,'failed':0});stats['total']+=1
        if isinstance(expected,(float,int)) and not isinstance(expected,bool):
            ok=isinstance(actual,(int,float)) and not isinstance(actual,bool) and abs(expected-actual)<=0.010001
        else: ok=expected==actual
        if ok:stats['passed']+=1
        else:
            stats['failed']+=1;result['issues'].append({'group':group,'year':year,'key':key,'cell':cell,'field':field,'expected':expected,'actual':actual,'delta':round(actual-expected,6) if isinstance(actual,(float,int)) and isinstance(expected,(float,int)) else None})
    def fetch(route,name):
        with urllib.request.urlopen(args.base+route,timeout=30) as r: d=json.load(r)
        (out/(name+'.json')).write_text(json.dumps(d,ensure_ascii=False));return d
    timeline=fetch('/api/timeline','timeline');result['api_meta']=timeline['meta'];current=timeline['meta']['anio_actual'];month=int(timeline['meta']['fecha_referencia'][5:7])
    sources={};annual={};projects={}
    for year in (2026,2027):
        path=ROOT/'data'/f'data_{year}.xlsx';before=sha(path)
        wb=openpyxl.load_workbook(path,read_only=True,data_only=True)
        sheets={sn:list(wb[sn].values) for sn in ('Info Proyectos','BackLog NOLA')}
        info=[];rows=[]
        for sn,target,namecol in [('Info Proyectos',info,5),('BackLog NOLA',rows,3)]:
            header=sheets[sn][0];keys=[norm(h) for h in header]
            for rownum,row in enumerate(sheets[sn][1:],2):
                if not(valid(row[2]) or valid(row[namecol])):continue
                def value(label, row=row,keys=keys):
                    try:return row[keys.index(norm(label))]
                    except (ValueError,IndexError):return None
                target.append({'row':rownum,'raw':row,'get':value,'name':text(row[namecol]),'pa':text(row[2]) if valid(row[2]) else None})
        bypa={r['pa']:r for r in info if r['pa']};byn={slug(r['name']):r for r in info}
        for r in rows:
            inf=bypa.get(r['pa']) if r['pa'] else byn.get(slug(r['name']))
            r['info']=inf;r['pr']=text(inf['get']('Project ID')) if inf else ''
            r['key']='PA:'+r['pa'].upper() if r['pa'] else ('PR:'+r['pr'].upper() if r['pr'] else 'NAME:'+slug(r['name']))
            r['money']={f:number(r['get'](col)) for f,col in {'valor_of':'Valor OF','acumulado_anterior':'Acum 2025' if year==2026 else 'Total Ejecutado Acumulado 2025-2026','backlog':f'Backlog {year}','total_ejecutado_acumulado':'TOTAL EJECUTADO ACUMULADO 2025-2026 (COPIAR)' if year==2026 else 'TOTAL EJECUTADO ACUMULADO 2025-2026-2027'}.items()}
            # Month columns use FIRST occurrence; second Nov/Jan is a dashboard helper.
            h=[norm(v) for v in sheets['BackLog NOLA'][0]]
            r['months']=[(number(r['raw'][h.index(norm(m))]),number(r['raw'][h.index(norm(m))+1])) for m in MONTHS]
            r['cells']=[openpyxl.utils.get_column_letter(h.index(norm(m))+1)+str(r['row']) for m in MONTHS]
            r['upside_cells']=[openpyxl.utils.get_column_letter(h.index(norm(m))+2)+str(r['row']) for m in MONTHS]
            r['status']=text(inf['get']('Estado')) if inf else text(r['get']('Estado'))
            r['pm']=text(inf['get']('PM/Líder')) if inf else text(r['get']('PM/Líder'))
        ids=collections.Counter(r['key'] for r in rows)
        for k,n in ids.items():check('unique_source_project',1,n,year,k)
        sources[year]={r['key']:r for r in rows}
        result['sources'][str(year)]={'path':str(path),'sha256':before,'projects':len(rows),'info_projects':len(info),'missing_pa':sum(not r['pa'] for r in rows),'status_counts':dict(collections.Counter(r['status'] for r in rows)),'missing_financials':dict(collections.Counter(f for r in rows for f,v in r['money'].items() if v is None)),'negative_month_values':sum(v is not None and v<0 for r in rows for pair in r['months'] for v in pair),'missing_month_values':sum(v is None for r in rows for pair in r['months'] for v in pair)}
        api=fetch(f'/api/backlog?anio={year}',f'backlog{year}');annual[year]=api
        ps=fetch(f'/api/proyectos?anio={year}',f'proyectos{year}');projects[year]=ps
        def apikey(p):return 'PA:'+text(p['num_pa']).upper() if valid(p.get('num_pa')) else 'NAME:'+slug(p.get('nombre_del_proyecto'))
        amap={apikey(p):p for p in api['backlog']};pmap={apikey(p):p for p in ps['proyectos']}
        # Missing-PA source joins by unique normalized project name, never by row position.
        for r in rows:
            k=r['key'];lookup=k if r['pa'] else 'NAME:'+slug(r['name']);a=amap.get(lookup);p=pmap.get(lookup)
            check('project_presence_annual',True,a is not None,year,k,field='presence')
            if a is None:continue
            for f,v in r['money'].items():check('annual_financials',v,a.get(f),year,k,'BackLog NOLA!'+str(r['row']),f)
            for i,(c,u) in enumerate(r['months']):
                for kind,v in [('fijo',c),('upside',u)]:check('annual_months',0 if v is None else v,a.get(MONTHS[i].lower()+'_'+kind),year,k,'BackLog NOLA!'+(r['cells'][i] if kind=='fijo' else r['upside_cells'][i]),MONTHS[i]+'_'+kind)
            for q in range(4):
                expected=sum(c or 0 for c,u in r['months'][q*3:q*3+3]);check('annual_quarters',expected,a.get('q'+str(q+1)),year,k,field='q'+str(q+1))
                qraw=number(r['get']('Q'+str(q+1)))
                if qraw is not None and abs(qraw-expected)>.01:result['source_warnings'].append({'type':'quarter_formula','year':year,'key':k,'row':r['row'],'quarter':q+1,'cached':qraw,'sum_months':expected})
            if p and r['info']:
                for f,col in {'estado':'Estado','project_id':'Project ID','cliente':'Cliente','nombre_del_proyecto':'Nombre del Proyecto','pm_lider':'PM/Líder','pm_lider_psa':'PM/Líder PSA','zona':'Zona','pais':'Pais','vendedor':'Vendedor','tsm':'TSM','billing_type':'Billing Type','billing_arrangement':'Billing Arrengement','project_status':'Project Status','estatus':'ESTATUS'}.items():
                    v=r['info']['get'](col);v=text(v) if valid(v) else None;av=p.get(f);av=text(av) if valid(av) else None
                    check('annual_descriptive',v,av,year,k,'Info Proyectos!'+str(r['info']['row']),f)
            m=r['money'];commit=sum(c or 0 for c,u in r['months'])
            if all(v is not None for v in m.values()):
                err=m['valor_of']-m['acumulado_anterior']-commit-m['backlog']
                if abs(err)>.02:result['source_warnings'].append({'type':'booking_identity','year':year,'key':k,'row':r['row'],'difference':err})
        check('source_unchanged',before,sha(path),year,field='sha256')
        for k in set(amap)-{(r['key'] if r['pa'] else 'NAME:'+slug(r['name'])) for r in rows}:check('project_extra_annual',False,True,year,k,field='extra_saved_project')
        raw={}
        for sn,rowsraw in sheets.items():
            seen={};headers=[]
            for i,v in enumerate(rowsraw[0]):
                base=text(v) or '__EMPTY';n=seen.get(base,0);seen[base]=n+1;headers.append(base+('_'+str(n) if n else ''))
            raw['InfoProyectos' if sn=='Info Proyectos' else 'Backlog']=[{h:v for h,v in zip(headers,row) if v is not None} for row in rowsraw[1:]]
        (out/f'input{year}.json').write_text(json.dumps(raw,default=str))
        wb.close()
    (out/'expected-sources.json').write_text(json.dumps({str(y):{k:{'money':r['money'],'months':r['months']} for k,r in ss.items()} for y,ss in sources.items()}))
    tback={r['clave_timeline']:r for r in timeline['backlog']};tproj={r['clave_timeline']:r for r in timeline['proyectos']}
    universe=set(sources[2026])|set(sources[2027]);periods=timeline['meta']['periodos']
    check('timeline_project_count',len(universe),len(tback),field='projects')
    for k in sorted(universe):
        versions=[(y,sources[y][k]) for y in sources if k in sources[y]]
        versions.sort(key=lambda v:(0 if v[0]==current else 1 if v[0]<current else 2,abs(v[0]-current)))
        y,r=versions[0];a=tback.get(k);p=tproj.get(k);check('timeline_project_presence',True,a is not None,y,k)
        if not a:continue
        check('timeline_source_priority',y,p['anio_atributos'],y,k)
        for f,v in r['money'].items():check('timeline_reference_money',v,a.get(f),y,k,field=f)
        expected_acum=(r['money']['acumulado_anterior'] or 0)+sum(c or 0 for c,u in r['months'][:12 if y<current else month if y==current else 0])
        check('timeline_accrued_today',expected_acum,a.get('acumulado_a_fecha'),y,k,field='acumulado_a_fecha')
        for year,s in sources.items():
            rr=s.get(k)
            for i in range(12):
                for pos,suffix in enumerate(('fijo','upside')):
                    v=(rr['months'][i][pos] or 0) if rr else None
                    check('timeline_months',v,a.get(f'{year}-{i+1:02}_{suffix}'),year,k,'BackLog NOLA!'+rr['cells'][i] if rr else '',f'{year}-{i+1:02}_{suffix}')
    # Every contiguous range in the 24-month calendar: full portfolio and default UI filters.
    aggregates={}
    for label,keys in [('all',universe),('default',{k for k in universe if next(sources[y][k] for y in sorted(sources,key=lambda yy:abs(yy-current)) if k in sources[y])['status'] not in ('Completed','Canceled')})]:
        actual_keys=set(tback) if label=='all' else {k for k,p in tproj.items() if p.get('estado') not in ('Completed','Canceled')}
        expected=[];actual=[]
        for period in periods:
            year,mo=map(int,period.split('-'));expected.append([sum((sources.get(year,{}).get(k,{}).get('months',[(0,0)]*12)[mo-1][j] or 0) for k in keys) for j in (0,1)])
            actual.append([sum((tback.get(k,{}).get(period+'_'+suffix) or 0) for k in actual_keys) for suffix in ('fijo','upside')])
        for start in range(len(periods)):
            for end in range(start,len(periods)):
                for j,suffix in enumerate(('commit','upside')):check('ranges_'+label,sum(r[j] for r in expected[start:end+1]),sum(r[j] for r in actual[start:end+1]),field=f'{periods[start]}..{periods[end]} {suffix}')
        ref=[next(sources[y][k] for y in sorted(sources,key=lambda yy:abs(yy-current)) if k in sources[y]) for k in keys]
        aggregates[label]={'projects':len(keys),'booking':sum(r['money']['valor_of'] or 0 for r in ref),'backlog':sum(r['money']['backlog'] or 0 for r in ref),'commit26':sum(r[0] for r in expected[:12]),'commit27':sum(r[0] for r in expected[12:]),'upside26':sum(r[1] for r in expected[:12]),'upside27':sum(r[1] for r in expected[12:]),'monthly':dict(zip(periods,expected))}
        saved_ref=[tback[k] for k in actual_keys]
        aggregates[label]['saved']={'projects':len(actual_keys),**{f:sum(r.get(f) or 0 for r in saved_ref) for f in ['valor_of','backlog','acumulado_a_fecha']},'commit26':sum(r[0] for r in actual[:12]),'commit27':sum(r[0] for r in actual[12:]),'upside26':sum(r[1] for r in actual[:12]),'upside27':sum(r[1] for r in actual[12:])}
        aggregates[label]['accrued_expected']=sum((r['money']['acumulado_anterior'] or 0)+sum(c or 0 for c,u in r['months'][:month]) for r in ref)
    result['metrics']=aggregates
    result['summary']={'comparisons':sum(v['total'] for v in result['checks'].values()),'failed':sum(v['failed'] for v in result['checks'].values()),'issues_by_group':dict(collections.Counter(i['group'] for i in result['issues'])),'affected_keys':len({i['key'] for i in result['issues'] if i['key']}),'note':'Repeated projections (annual API, timeline and ranges) may report the same underlying source change more than once.'}
    (out/'resultado.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    with (out/'diferencias.csv').open('w') as f:
        writer=csv.DictWriter(f,fieldnames=['group','year','key','cell','field','expected','actual','delta']);writer.writeheader();writer.writerows(result['issues'])
    rows=''.join('<tr>'+''.join('<td>'+html.escape(str(i.get(c,'')))+'</td>' for c in ['group','year','key','cell','field','expected','actual','delta'])+'</tr>' for i in result['issues'][:500])
    (out/'informe.html').write_text('<!doctype html><meta charset="utf-8"><title>Auditoría Excel / dashboard</title><style>body{font:15px system-ui;margin:35px}td,th{padding:7px;border:1px solid #ddd}table{border-collapse:collapse}pre{white-space:pre-wrap}</style><h1>Conciliación de datos</h1><p>Lectura directa de Info Proyectos y BackLog NOLA. Tolerancia monetaria: USD 0.01. No se modificaron fuentes ni base de datos.</p><pre>'+html.escape(json.dumps({k:result[k] for k in ['created_at','summary','sources','checks','metrics']},ensure_ascii=False,indent=2))+'</pre><h2>Diferencias (primeras 500; todas en CSV)</h2><table><tr><th>Grupo<th>Año<th>PA/PR<th>Celda/fila<th>Campo<th>Excel<th>API<th>Delta</tr>'+rows+'</table>')
    for f in out.iterdir():
        if f.is_file():os.chmod(f,0o600)
    print(json.dumps({'summary':result['summary'],'checks':result['checks'],'sources':result['sources'],'metrics':{k:{kk:vv for kk,vv in v.items() if kk!='monthly'} for k,v in aggregates.items()},'report':str(out/'informe.html')},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
