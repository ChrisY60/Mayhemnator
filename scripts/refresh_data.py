"""Refresh the public Mayhem Meta snapshot. Run: python scripts/refresh_data.py.
Requires beautifulsoup4. Requests are limited to two concurrent champion pages.
"""
import concurrent.futures, datetime, json, re, time, urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://mayhemmeta.com'
def fetch(url):
    for attempt in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (Mayhemnator snapshot)'}), timeout=40).read().decode('utf-8')
        except Exception:
            if attempt == 2: raise
            time.sleep(2 + attempt)

def payload(html):
    return ''.join(json.loads(m) for m in re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html))

def arrays(text, key):
    result=[]
    for m in re.finditer('"'+key+'":', text):
        try:
            value,_=json.JSONDecoder().raw_decode(text[m.end():])
            if isinstance(value,list): result.append(value)
        except ValueError: pass
    return result

def number(text):
    m=re.search(r'-?\d[\d,]*(?:\.\d+)?',text)
    return float(m[0].replace(',','')) if m else None

def detail(champ):
    html=fetch(BASE+'/champions/'+champ['slug']); soup=BeautifulSoup(html,'html.parser')
    text=payload(html)
    allrows=arrays(text,'rows')
    champ['augments']=next((a for a in allrows if a and 'rarity' in a[0] and any(r.get('games',0)>0 for r in a)),[])
    champ['tables']={}
    for table in soup.find_all('table'):
        title=table.find_previous(['h2','h3']).get_text(strip=True)
        if title not in ['Boots','Most Common Items','Best Items','Popular Combos','Best Combos','Best Teammates','Worst Teammates','Best Matchups','Worst Matchups']: continue
        rows=[]
        for row in table.find_all('tr')[1:]:
            cols=row.find_all('td')
            if len(cols)<3: continue
            combo=title in ['Popular Combos','Best Combos']
            links=[a.get_text(strip=True) for col in cols[:2 if combo else 1] for a in col.find_all('a')]
            img=cols[0].find('img')
            rate=cols[-1]; pick=cols[-2]
            rows.append({'name':' + '.join(links) if combo else cols[0].get_text(' ',strip=True),'names':links,'icon':img.get('src') if img else None,'pick':number(pick.get_text()),'wr':number(rate.get_text()),'delta':number(rate.find_all('span')[-1].get_text()) if len(rate.find_all('span'))>1 else None})
        champ['tables'][title]=rows
    desc=soup.find('meta',{'name':'description'})['content']
    m=re.search(r'over ([\d,]+) games',desc); champ['games']=int(m[1].replace(',','')) if m else None
    title=soup.title.get_text(); m=re.search(r'Build ([\d.]+)',title); champ['patch']=m[1] if m else None
    return champ

def main():
    html=fetch(BASE); soup=BeautifulSoup(html,'html.parser'); p=payload(html)
    catalog=arrays(p,'champions')[0]; augments=arrays(p,'augments')[0]
    lookup={c['slug']:c for c in catalog}; champions=[]
    for tr in soup.select('tbody tr'):
        td=tr.find_all('td'); a=tr.find('a',href=re.compile('^/champions/'))
        if not a or len(td)<5: continue
        c=dict(lookup[a['href'].split('/')[-1]])
        c.update(wr=number(td[3].get_text()),pick=number(td[4].get_text()),tier=td[2].get_text(strip=True))
        champions.append(c)
    # Riot metadata supplies champion classes, never substituted as Mayhem win rates.
    version=json.loads(fetch('https://ddragon.leagueoflegends.com/api/versions.json'))[0]
    riot=json.loads(fetch(f'https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json'))['data']
    tags={int(c['key']):c['tags'] for c in riot.values()}
    for c in champions: c['roles']=tags.get(c['champion_id'],[])
    errors=[]; complete=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        tasks={pool.submit(detail,c):c for c in champions}
        for f in concurrent.futures.as_completed(tasks):
            c=tasks[f]
            try: complete.append(f.result())
            except Exception as e:
                c.update(augments=[],tables={},error=str(e));complete.append(c);errors.append(c['name'])
            if len(complete)%20==0: print(f'{len(complete)}/{len(champions)} champions',flush=True)
    data={'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':BASE,'riotVersion':version,'champions':sorted(complete,key=lambda c:c['name']),'augments':augments,'errors':errors}
    target=ROOT/'dist'/'data.json'; temporary=target.with_suffix('.tmp'); temporary.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8'); temporary.replace(target)
    print(f'Saved {len(complete)} champions, {len(augments)} augments. Failed details: {errors}',flush=True)

if __name__=='__main__': main()
